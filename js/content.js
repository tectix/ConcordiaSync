(function() {
  'use strict';
  
  function sanitizeText(text) {
    if (!text || typeof text !== 'string') return '';
    return text.trim()
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      .replace(/["'<>&]/g, match => ({
        '"': '&quot;',
        "'": '&#39;',
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;'
      }[match]))
      .substring(0, 500);
  }
  
  function parseTimeString(timeStr) {
    const cleaned = sanitizeText(timeStr);
    const timeMatch = cleaned.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    
    if (!timeMatch) return null;
    
    const [, startHour, startMin, startPeriod, endHour, endMin, endPeriod] = timeMatch;
    
    return {
      start: formatTime24(startHour, startMin, startPeriod),
      end: formatTime24(endHour, endMin, endPeriod)
    };
  }
  
  function formatTime24(hour, minute, period) {
    let h = parseInt(hour, 10);
    const m = parseInt(minute, 10);
    
    if (period && period.toUpperCase() === 'PM' && h !== 12) h += 12;
    if (period && period.toUpperCase() === 'AM' && h === 12) h = 0;
    
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }
  
  function parseDayString(daysStr) {
    const dayMap = { 
      'Mo': 0, 'Tu': 1, 'We': 2, 'Th': 3, 'Fr': 4, 'Sa': 5, 'Su': 6 
    };
    
    const days = [];
    const dayPattern = /(Mo|Tu|We|Th|Fr|Sa|Su)/g;
    let match;
    
    while ((match = dayPattern.exec(daysStr)) !== null) {
      const dayNum = dayMap[match[1]];
      if (dayNum !== undefined) {
        days.push(dayNum);
      }
    }
    
    return days;
  }
  
  function parseTimeRange(startTime, endTime) {
    const start = convertTo24Hour(startTime);
    const end = convertTo24Hour(endTime);
    
    if (start && end) {
      return { start, end };
    }
    return null;
  }
  
  function convertTo24Hour(timeStr) {
    const match = timeStr.match(/^(\d{1,2}):(\d{2})(AM|PM)?$/i);
    if (!match) return null;
    
    let [, hour, minute, period] = match;
    hour = parseInt(hour, 10);
    minute = parseInt(minute, 10);
    
    if (period) {
      if (period.toUpperCase() === 'PM' && hour !== 12) hour += 12;
      if (period.toUpperCase() === 'AM' && hour === 12) hour = 0;
    }
    
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  }
  
  function getTypeDescription(type) {
    const typeMap = {
      'LEC': 'Lecture',
      'LAB': 'Laboratory', 
      'TUT': 'Tutorial'
    };
    return typeMap[type] || 'Lecture';
  }
  
  function extractEnrolledCourses() {
    const courses = [];
    
    try {
      const pageText = document.body.textContent || document.body.innerText || '';
      console.log('ConcordiaSync: Extracting enrolled courses from page');
      
      const lines = pageText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const courseMatch = line.match(/^([A-Z]{4}\s+\d{3}[A-Z\-]*)/);
        
        if (courseMatch) {
          const courseCode = courseMatch[1];
          let section = '';
          
          const sectionMatch = line.match(/([A-Z]{2,3})\s*\((\d+)\)/);
          if (sectionMatch) {
            section = sectionMatch[2];
          }
          
          courses.push({
            code: courseCode.replace(/\s+/g, ' ').trim(),
            section: section,
            term: getCurrentTerm()
          });
          
          console.log('ConcordiaSync: Found enrolled course:', { code: courseCode, section });
        }
      }
      
      console.log('ConcordiaSync: Total enrolled courses found:', courses.length);
      
    } catch (error) {
      console.error('ConcordiaSync: Error extracting enrolled courses:', error);
    }
    
    return courses;
  }
  
  function getCurrentTerm() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    if (month >= 8) {
      return `${year}2`;
    } else if (month >= 4) {
      return `${year}4`;
    } else {
      return `${year}1`;
    }
  }
  
  function determineClassType(subject) {
    const lower = subject.toLowerCase();
    if (lower.includes('lab')) return 'Laboratory';
    if (lower.includes('tutorial')) return 'Tutorial';
    return 'Lecture';
  }
  
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractCourses') {
      try {
        const enrolledCourses = extractEnrolledCourses();
        sendResponse({
          success: true,
          data: enrolledCourses,
          url: window.location.href
        });
      } catch (error) {
        sendResponse({
          success: false,
          error: 'Failed to extract enrolled courses',
          details: error.message
        });
      }
    }
    return true;
  });
  
})();