const axios = require('axios');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 3600 });

class CourseService {
  constructor() {
    this.apiKey = process.env.CONCORDIA_API_KEY;
    this.baseURL = process.env.CONCORDIA_API_BASE_URL || 'https://opendata.concordia.ca/API/v1';
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'User-Agent': 'ConcordiaSync/1.0.0',
        'Accept': 'application/json'
      }
    });

    this.client.interceptors.response.use(
      response => response,
      error => {
        console.error('Concordia API Error:', {
          status: error.response?.status,
          data: error.response?.data,
          url: error.config?.url
        });
        throw error;
      }
    );
  }

  async getCoursesByTerm(term) {
    const cacheKey = `courses_${term}`;
    const cached = cache.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const response = await this.client.get(`/course/catalog/filter/*/*/*/${term}`, {
        params: { key: this.apiKey }
      });

      const courses = this.processCourseData(response.data);
      cache.set(cacheKey, courses, 1800);
      
      return courses;
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        throw new Error('Concordia API timeout - please try again');
      }
      throw new Error(`Failed to fetch courses: ${error.message}`);
    }
  }

  async getCourseDetails(courseCode, term) {
    const cacheKey = `course_${courseCode}_${term}`;
    const cached = cache.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const [subject, number] = courseCode.split(' ');
      
      const scheduleResponse = await this.client.get(`/course/schedule/filter/${subject}/${number}/*/${term}`, {
        params: { key: this.apiKey }
      });

      const descriptionResponse = await this.client.get(`/course/description/filter/${subject}/${number}`, {
        params: { key: this.apiKey }
      }).catch(() => ({ data: [] }));

      const courseDetails = this.combineCourseData(scheduleResponse.data, descriptionResponse.data, courseCode);
      cache.set(cacheKey, courseDetails, 1800);
      
      return courseDetails;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch course details: ${error.message}`);
    }
  }
  
  combineCourseData(scheduleData, descriptionData, courseCode) {
    if (!scheduleData || scheduleData.length === 0) {
      return null;
    }

    const description = descriptionData?.[0] || {};
    const sections = this.processScheduleResponse(scheduleData);

    return {
      code: courseCode,
      title: this.sanitizeString(description.title || ''),
      credits: parseFloat(description.creditValue || 0),
      sections: sections,
      description: this.sanitizeString(description.description || ''),
      prerequisites: this.sanitizeString(description.prerequisites || ''),
      department: this.sanitizeString(description.subject || courseCode.split(' ')[0])
    };
  }
  
  processScheduleResponse(scheduleData) {
    const sectionsMap = new Map();
    
    scheduleData.forEach(item => {
      const sectionKey = `${item.section}-${item.componentCode}`;
      
      if (!sectionsMap.has(sectionKey)) {
        sectionsMap.set(sectionKey, {
          section: this.sanitizeString(item.section),
          type: this.normalizeClassType(item.componentCode),
          instructor: this.sanitizeString(item.instructors?.[0]?.firstName + ' ' + item.instructors?.[0]?.lastName || ''),
          location: this.sanitizeString(item.locationCode || ''),
          schedule: [],
          capacity: parseInt(item.classCapacity || 0),
          enrolled: parseInt(item.enrollmentTotal || 0),
          waitlist: parseInt(item.waitlistTotal || 0)
        });
      }
      
      const section = sectionsMap.get(sectionKey);
      
      if (item.modays || item.tuesdays || item.wednesdays || item.thursdays || item.fridays || item.saturdays || item.sundays) {
        const meeting = {
          days: this.extractDaysFromSchedule(item),
          startTime: this.convertTimeFormat(item.classStartTime),
          endTime: this.convertTimeFormat(item.classEndTime),
          location: this.sanitizeString(item.locationCode || ''),
          type: this.normalizeClassType(item.componentCode)
        };
        
        if (meeting.days.length > 0 && meeting.startTime && meeting.endTime) {
          section.schedule.push(meeting);
        }
      }
    });
    
    return Array.from(sectionsMap.values()).filter(section => section.schedule.length > 0);
  }
  
  extractDaysFromSchedule(item) {
    const days = [];
    if (item.modays === 'Y') days.push(0);
    if (item.tuesdays === 'Y') days.push(1);
    if (item.wednesdays === 'Y') days.push(2);
    if (item.thursdays === 'Y') days.push(3);
    if (item.fridays === 'Y') days.push(4);
    if (item.saturdays === 'Y') days.push(5);
    if (item.sundays === 'Y') days.push(6);
    return days;
  }
  
  convertTimeFormat(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return null;
    
    // Convert from HHMM format to HH:MM
    if (timeStr.length === 4 && /^\d{4}$/.test(timeStr)) {
      const hours = timeStr.substring(0, 2);
      const minutes = timeStr.substring(2, 4);
      return `${hours}:${minutes}`;
    }
    
    return this.sanitizeTime(timeStr);
  }

  processCourseData(rawData) {
    if (!Array.isArray(rawData)) {
      return [];
    }

    return rawData.map(course => ({
      code: this.sanitizeString(course.courseCode || course.code),
      title: this.sanitizeString(course.title || course.courseName),
      credits: parseFloat(course.credits || 0),
      sections: this.processSections(course.sections || []),
      description: this.sanitizeString(course.description || ''),
      prerequisites: this.sanitizeString(course.prerequisites || ''),
      department: this.sanitizeString(course.department || '')
    })).filter(course => course.code && course.sections.length > 0);
  }

  processCourseDetails(rawData) {
    if (!rawData) return null;

    return {
      code: this.sanitizeString(rawData.courseCode || rawData.code),
      title: this.sanitizeString(rawData.title || rawData.courseName),
      credits: parseFloat(rawData.credits || 0),
      sections: this.processSections(rawData.sections || []),
      description: this.sanitizeString(rawData.description || ''),
      prerequisites: this.sanitizeString(rawData.prerequisites || ''),
      department: this.sanitizeString(rawData.department || ''),
      schedule: this.processScheduleData(rawData.schedule || rawData.sections)
    };
  }

  processSections(sections) {
    if (!Array.isArray(sections)) {
      return [];
    }

    return sections.map(section => ({
      section: this.sanitizeString(section.section || section.sectionCode),
      type: this.normalizeClassType(section.type || section.classType || 'LEC'),
      instructor: this.sanitizeString(section.instructor || ''),
      location: this.sanitizeString(section.location || section.room || ''),
      schedule: this.processScheduleData(section.schedule || section.meetings || []),
      capacity: parseInt(section.capacity || 0),
      enrolled: parseInt(section.enrolled || 0),
      waitlist: parseInt(section.waitlist || 0)
    })).filter(section => section.section);
  }

  processScheduleData(scheduleData) {
    if (!scheduleData) return [];
    
    const meetings = Array.isArray(scheduleData) ? scheduleData : [scheduleData];
    
    return meetings.map(meeting => ({
      days: this.parseDays(meeting.days || meeting.day || ''),
      startTime: this.sanitizeTime(meeting.startTime || meeting.start),
      endTime: this.sanitizeTime(meeting.endTime || meeting.end),
      location: this.sanitizeString(meeting.location || meeting.room || ''),
      type: this.normalizeClassType(meeting.type || 'LEC')
    })).filter(meeting => meeting.days.length > 0 && meeting.startTime && meeting.endTime);
  }

  parseDays(dayString) {
    if (!dayString || typeof dayString !== 'string') return [];
    
    const dayMap = {
      'M': 0, 'Mo': 0, 'Monday': 0,
      'T': 1, 'Tu': 1, 'Tuesday': 1,
      'W': 2, 'We': 2, 'Wednesday': 2,
      'R': 3, 'Th': 3, 'Thursday': 3,
      'F': 4, 'Fr': 4, 'Friday': 4,
      'S': 5, 'Sa': 5, 'Saturday': 5,
      'U': 6, 'Su': 6, 'Sunday': 6
    };

    const days = [];
    const dayPattern = /(Mo|Tu|We|Th|Fr|Sa|Su|M|T|W|R|F|S|U|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/gi;
    let match;

    while ((match = dayPattern.exec(dayString)) !== null) {
      const dayNum = dayMap[match[1]];
      if (dayNum !== undefined && !days.includes(dayNum)) {
        days.push(dayNum);
      }
    }

    return days.sort();
  }

  normalizeClassType(type) {
    if (!type || typeof type !== 'string') return 'Lecture';
    
    const typeMap = {
      'LEC': 'Lecture', 'LECTURE': 'Lecture',
      'LAB': 'Laboratory', 'LABORATORY': 'Laboratory',
      'TUT': 'Tutorial', 'TUTORIAL': 'Tutorial',
      'SEM': 'Seminar', 'SEMINAR': 'Seminar',
      'WOR': 'Workshop', 'WORKSHOP': 'Workshop'
    };

    return typeMap[type.toUpperCase()] || 'Lecture';
  }

  sanitizeString(str) {
    if (!str || typeof str !== 'string') return '';
    return str.trim()
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      .substring(0, 500);
  }

  sanitizeTime(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return null;
    
    const cleaned = timeStr.trim();
    const timePattern = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i;
    const match = cleaned.match(timePattern);
    
    if (!match) return null;
    
    let [, hour, minute, second, period] = match;
    hour = parseInt(hour, 10);
    minute = parseInt(minute, 10);
    
    if (period) {
      if (period.toUpperCase() === 'PM' && hour !== 12) hour += 12;
      if (period.toUpperCase() === 'AM' && hour === 12) hour = 0;
    }
    
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  }
}

module.exports = new CourseService();