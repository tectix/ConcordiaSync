const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('rate-limiter-flexible');
const { body, param, validationResult } = require('express-validator');
require('dotenv').config();

const courseService = require('./services/courseService');
const scheduleService = require('./services/scheduleService');

const app = express();
const PORT = process.env.PORT || 3000;

const rateLimiter = new rateLimit.RateLimiterMemory({
  keyPrefix: 'concordiasync',
  points: 100,
  duration: 3600,
});

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
    const isAllowed = allowedOrigins.some(allowed => 
      origin.startsWith(allowed.trim())
    );
    
    if (isAllowed || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

app.use(express.json({ limit: '10mb' }));

app.use(async (req, res, next) => {
  try {
    await rateLimiter.consume(req.ip);
    next();
  } catch (rejRes) {
    res.status(429).json({ 
      error: 'Rate limit exceeded',
      retryAfter: Math.round(rejRes.msBeforeNext / 1000) 
    });
  }
});

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

app.get('/api/courses/:term', [
  param('term').isLength({ min: 4, max: 10 }).matches(/^\d{4}(1|2|4)$/),
  handleValidation
], async (req, res) => {
  try {
    const { term } = req.params;
    const courses = await courseService.getCoursesByTerm(term);
    
    res.json({
      success: true,
      data: courses,
      term,
      count: courses.length
    });
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({
      error: 'Failed to fetch courses',
      message: error.message
    });
  }
});

app.post('/api/schedule/parse', [
  body('courseData').isArray().withMessage('Course data must be an array'),
  body('courseData.*.code').isString().isLength({ min: 1, max: 20 }),
  body('courseData.*.section').optional().isString().isLength({ max: 10 }),
  handleValidation
], async (req, res) => {
  try {
    const { courseData } = req.body;
    const schedule = await scheduleService.generateSchedule(courseData);
    
    res.json({
      success: true,
      data: schedule,
      count: schedule.length
    });
  } catch (error) {
    console.error('Error generating schedule:', error);
    res.status(500).json({
      error: 'Failed to generate schedule',
      message: error.message
    });
  }
});

app.post('/api/schedule/csv', [
  body('scheduleData').isArray().withMessage('Schedule data must be an array'),
  body('semester').optional().isObject(),
  handleValidation
], async (req, res) => {
  try {
    const { scheduleData, semester } = req.body;
    const csvContent = scheduleService.generateCSV(scheduleData, semester);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="concordia-schedule.csv"');
    res.send(csvContent);
  } catch (error) {
    console.error('Error generating CSV:', error);
    res.status(500).json({
      error: 'Failed to generate CSV',
      message: error.message
    });
  }
});

app.get('/api/course/:code/:term', [
  param('code').isString().isLength({ min: 1, max: 20 }),
  param('term').isLength({ min: 4, max: 10 }).matches(/^\d{4}(1|2|4)$/),
  handleValidation
], async (req, res) => {
  try {
    const { code, term } = req.params;
    const courseDetails = await courseService.getCourseDetails(code, term);
    
    if (!courseDetails) {
      return res.status(404).json({
        error: 'Course not found',
        code,
        term
      });
    }
    
    res.json({
      success: true,
      data: courseDetails
    });
  } catch (error) {
    console.error('Error fetching course details:', error);
    res.status(500).json({
      error: 'Failed to fetch course details',
      message: error.message
    });
  }
});

app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl
  });
});

app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`ConcordiaSync Backend running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });
}

module.exports = app;