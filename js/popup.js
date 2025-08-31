(function() {
  'use strict';
  
  const STATE = {
    extractedCourses: [],
    enrolledCourses: [],
    isProcessing: false
  };
  
  const CONFIG = {
    backendUrl: 'https://concordiasync-production.up.railway.app'
  };
  
  const DOM = {
    extractBtn: null,
    exportBtn: null,
    status: null,
    preview: null,
    courseList: null
  };
  
  function initializeElements() {
    DOM.extractBtn = document.getElementById('extractBtn');
    DOM.exportBtn = document.getElementById('exportBtn');
    DOM.status = document.getElementById('status');
    DOM.preview = document.getElementById('preview');
    DOM.courseList = document.getElementById('courseList');
    
    if (!DOM.extractBtn || !DOM.exportBtn || !DOM.status) {
      throw new Error('Required DOM elements not found');
    }
  }
  
  function showStatus(message, type = 'info') {
    if (!DOM.status) return;
    
    const sanitizedMessage = sanitizeHtml(message);
    DOM.status.textContent = sanitizedMessage;
    DOM.status.className = `status ${type}`;
  }
  
  function sanitizeHtml(text) {
    if (!text || typeof text !== 'string') return '';
    return text.replace(/[<>&"']/g, match => ({
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      '"': '&quot;',
      "'": '&#39;'
    }[match])).substring(0, 200);
  }
  
  function validateCourseData(courses) {
    if (!Array.isArray(courses)) return false;
    
    return courses.every(course => 
      course &&
      typeof course.subject === 'string' &&
      typeof course.day === 'number' &&
      typeof course.startTime === 'string' &&
      typeof course.endTime === 'string' &&
      course.day >= 0 && course.day <= 6 &&
      /^\d{2}:\d{2}$/.test(course.startTime) &&
      /^\d{2}:\d{2}$/.test(course.endTime)
    );
  }
  
  function renderCoursePreview(courses) {
    if (!DOM.courseList || !DOM.preview) return;
    
    if (!courses.length) {
      DOM.preview.classList.add('hidden');
      return;
    }
    
    DOM.courseList.innerHTML = '';
    
    courses.forEach(course => {
      const courseElement = document.createElement('div');
      courseElement.className = 'course-item';
      
      const title = document.createElement('div');
      title.className = 'course-title';
      title.textContent = sanitizeHtml(course.subject);
      
      const details = document.createElement('div');
      details.className = 'course-details';
      
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      details.textContent = `${days[course.day]} ${course.startTime}-${course.endTime} | ${sanitizeHtml(course.location)}`;
      
      courseElement.appendChild(title);
      courseElement.appendChild(details);
      DOM.courseList.appendChild(courseElement);
    });
    
    DOM.preview.classList.remove('hidden');
  }
  
  function setProcessingState(isProcessing) {
    STATE.isProcessing = isProcessing;
    DOM.extractBtn.disabled = isProcessing;
    DOM.exportBtn.disabled = isProcessing || !STATE.extractedCourses.length;
    
    DOM.extractBtn.textContent = isProcessing ? 'Extracting...' : '📅 Extract Schedule';
  }
  
  async function extractSchedule() {
    if (STATE.isProcessing) return;
    
    try {
      setProcessingState(true);
      showStatus('Step 1: Extracting enrolled courses...', 'info');
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        throw new Error('No active tab found');
      }
      
      if (!tab.url.includes('concordia.ca')) {
        showStatus('Please navigate to your Concordia student portal', 'error');
        return;
      }
      
      const response = await chrome.tabs.sendMessage(tab.id, { 
        action: 'extractCourses' 
      });
      
      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to extract enrolled courses');
      }
      
      STATE.enrolledCourses = response.data;
      
      if (STATE.enrolledCourses.length === 0) {
        showStatus('No enrolled courses found on this page', 'error');
        return;
      }
      
      showStatus(`Step 2: Fetching schedule data for ${STATE.enrolledCourses.length} courses...`, 'info');
      
      const scheduleResponse = await fetch(`${CONFIG.backendUrl}/api/schedule/parse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          courseData: STATE.enrolledCourses
        })
      });
      
      if (!scheduleResponse.ok) {
        const errorData = await scheduleResponse.json().catch(() => ({}));
        throw new Error(errorData.message || `Server error: ${scheduleResponse.status}`);
      }
      
      const scheduleData = await scheduleResponse.json();
      
      if (!scheduleData.success || !scheduleData.data) {
        throw new Error('Invalid response from schedule service');
      }
      
      STATE.extractedCourses = scheduleData.data;
      
      if (STATE.extractedCourses.length === 0) {
        showStatus('No schedule data available for your courses', 'error');
      } else {
        showStatus(`Found ${STATE.extractedCourses.length} class sessions`, 'success');
        renderCoursePreview(STATE.extractedCourses);
      }
      
    } catch (error) {
      console.error('ConcordiaSync extraction error:', error);
      showStatus(`Error: ${error.message}`, 'error');
      STATE.extractedCourses = [];
    } finally {
      setProcessingState(false);
    }
  }
  
  function generateCSV(courses) {
    const headers = [
      'Subject', 'Start Date', 'Start Time', 'End Date', 'End Time',
      'All Day Event', 'Description', 'Location', 'Private'
    ];
    
    const startDate = new Date('2024-09-02');
    const endDate = new Date('2024-12-31');
    
    const events = [];
    
    courses.forEach(course => {
      const firstOccurrence = getFirstWeekdayOccurrence(startDate, course.day);
      let currentDate = new Date(firstOccurrence);
      
      while (currentDate <= endDate) {
        if (!isBreakWeek(currentDate)) {
          events.push({
            Subject: sanitizeCsvField(course.subject),
            'Start Date': formatDate(currentDate),
            'Start Time': course.startTime,
            'End Date': formatDate(currentDate),
            'End Time': course.endTime,
            'All Day Event': 'False',
            Description: sanitizeCsvField(course.description || ''),
            Location: sanitizeCsvField(course.location || ''),
            Private: 'False'
          });
        }
        currentDate.setDate(currentDate.getDate() + 7);
      }
    });
    
    const csvContent = [
      headers.join(','),
      ...events.map(event => headers.map(header => 
        `"${event[header].replace(/"/g, '""')}"`
      ).join(','))
    ].join('\n');
    
    return csvContent;
  }
  
  function sanitizeCsvField(text) {
    if (!text || typeof text !== 'string') return '';
    return text.trim()
      .replace(/[\r\n\t]/g, ' ')
      .replace(/\s+/g, ' ')
      .substring(0, 255);
  }
  
  function getFirstWeekdayOccurrence(startDate, targetDay) {
    const date = new Date(startDate);
    const daysAhead = (targetDay - date.getDay() + 7) % 7;
    date.setDate(date.getDate() + daysAhead);
    return date;
  }
  
  function formatDate(date) {
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  }
  
  function isBreakWeek(date) {
    const thanksgiving = new Date('2024-11-25');
    const christmasStart = new Date('2024-12-23');
    
    return (date >= thanksgiving && date <= new Date('2024-11-29')) ||
           (date >= christmasStart);
  }
  
  function downloadCSV() {
    if (!STATE.extractedCourses.length) return;
    
    try {
      const csvContent = generateCSV(STATE.extractedCourses);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `concordia-schedule-${new Date().getFullYear()}.csv`;
      link.style.display = 'none';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
      
      showStatus('CSV file downloaded successfully', 'success');
      
    } catch (error) {
      console.error('ConcordiaSync CSV generation error:', error);
      showStatus('Failed to generate CSV file', 'error');
    }
  }
  
  function initialize() {
    try {
      initializeElements();
      
      DOM.extractBtn.addEventListener('click', extractSchedule);
      DOM.exportBtn.addEventListener('click', downloadCSV);
      
      showStatus('Click "Extract Schedule" to begin', 'info');
      
    } catch (error) {
      console.error('ConcordiaSync initialization error:', error);
    }
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
  
})();