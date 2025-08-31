const courseService = require('./courseService');

class ScheduleService {
  async generateSchedule(courseData) {
    const scheduleEvents = [];
    
    for (const courseInfo of courseData) {
      try {
        const courseDetails = await this.getCourseScheduleData(courseInfo);
        if (courseDetails && courseDetails.length > 0) {
          scheduleEvents.push(...courseDetails);
        }
      } catch (error) {
        console.error(`Error processing course ${courseInfo.code}:`, error.message);
      }
    }
    
    return scheduleEvents;
  }

  async getCourseScheduleData(courseInfo) {
    const { code, section, term = this.getCurrentTerm() } = courseInfo;
    
    try {
      const courseDetails = await courseService.getCourseDetails(code, term);
      if (!courseDetails) {
        throw new Error(`Course ${code} not found for term ${term}`);
      }

      const targetSection = section 
        ? courseDetails.sections.find(s => s.section === section)
        : courseDetails.sections[0];

      if (!targetSection) {
        throw new Error(`Section ${section || 'default'} not found for course ${code}`);
      }

      return this.convertToScheduleEvents(courseDetails, targetSection);
    } catch (error) {
      console.error(`Failed to get schedule for ${code}:`, error.message);
      return [];
    }
  }

  convertToScheduleEvents(courseDetails, section) {
    const events = [];
    
    if (!section.schedule || section.schedule.length === 0) {
      return [];
    }

    section.schedule.forEach(meeting => {
      meeting.days.forEach(dayNum => {
        events.push({
          subject: `${courseDetails.code} - ${courseDetails.title}`,
          day: dayNum,
          startTime: meeting.startTime,
          endTime: meeting.endTime,
          location: meeting.location || section.location || 'TBD',
          description: `${courseDetails.code} | ${section.type} | ${courseDetails.credits} Credits | Instructor: ${section.instructor || 'TBD'}`,
          type: section.type,
          instructor: section.instructor || 'TBD',
          section: section.section,
          credits: courseDetails.credits,
          department: courseDetails.department
        });
      });
    });

    return events;
  }

  generateCSV(scheduleData, semesterInfo = {}) {
    const headers = [
      'Subject', 'Start Date', 'Start Time', 'End Date', 'End Time',
      'All Day Event', 'Description', 'Location', 'Private'
    ];

    const { startDate, endDate } = this.getSemesterDates(semesterInfo);
    const events = [];

    scheduleData.forEach(course => {
      const firstOccurrence = this.getFirstWeekdayOccurrence(startDate, course.day);
      let currentDate = new Date(firstOccurrence);

      while (currentDate <= endDate) {
        if (!this.isBreakWeek(currentDate, semesterInfo.breaks)) {
          events.push({
            Subject: this.sanitizeCsvField(course.subject),
            'Start Date': this.formatDate(currentDate),
            'Start Time': course.startTime,
            'End Date': this.formatDate(currentDate),
            'End Time': course.endTime,
            'All Day Event': 'False',
            Description: this.sanitizeCsvField(course.description),
            Location: this.sanitizeCsvField(course.location),
            Private: 'False'
          });
        }
        currentDate.setDate(currentDate.getDate() + 7);
      }
    });

    const csvContent = [
      headers.join(','),
      ...events.map(event => headers.map(header => 
        `"${event[header].toString().replace(/"/g, '""')}"`
      ).join(','))
    ].join('\n');

    return csvContent;
  }

  getSemesterDates(semesterInfo) {
    const currentYear = new Date().getFullYear();
    
    if (semesterInfo.startDate && semesterInfo.endDate) {
      return {
        startDate: new Date(semesterInfo.startDate),
        endDate: new Date(semesterInfo.endDate)
      };
    }

    const term = semesterInfo.term || this.getCurrentTerm();
    const year = parseInt(term.substring(0, 4)) || currentYear;
    const semester = term.substring(4) || '2';

    switch (semester) {
      case '1': // Fall
        return {
          startDate: new Date(year, 8, 1), // September 1
          endDate: new Date(year, 11, 31)  // December 31
        };
      case '2': // Winter
        return {
          startDate: new Date(year, 0, 1),  // January 1
          endDate: new Date(year, 3, 30)    // April 30
        };
      case '4': // Summer
        return {
          startDate: new Date(year, 4, 1),  // May 1
          endDate: new Date(year, 7, 31)    // August 31
        };
      default:
        return {
          startDate: new Date(year, 0, 1),
          endDate: new Date(year, 11, 31)
        };
    }
  }

  getFirstWeekdayOccurrence(startDate, targetDay) {
    const date = new Date(startDate);
    const daysAhead = (targetDay - date.getDay() + 7) % 7;
    date.setDate(date.getDate() + daysAhead);
    return date;
  }

  isBreakWeek(date, customBreaks = []) {
    const defaultBreaks = [
      { start: new Date(2024, 10, 25), end: new Date(2024, 10, 29) }, // Thanksgiving
      { start: new Date(2024, 11, 23), end: new Date(2024, 11, 31) }, // Christmas
      { start: new Date(2025, 2, 1), end: new Date(2025, 2, 7) },     // Reading Week (Winter)
      { start: new Date(2025, 9, 14), end: new Date(2025, 9, 18) }    // Reading Week (Fall)
    ];

    const allBreaks = [...defaultBreaks, ...customBreaks];
    
    return allBreaks.some(breakPeriod => 
      date >= breakPeriod.start && date <= breakPeriod.end
    );
  }

  formatDate(date) {
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  }

  sanitizeCsvField(text) {
    if (!text || typeof text !== 'string') return '';
    return text.trim()
      .replace(/[\r\n\t]/g, ' ')
      .replace(/\s+/g, ' ')
      .substring(0, 255);
  }

  getCurrentTerm() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    if (month >= 8) { // September onwards
      return `${year}2`; // Fall term
    } else if (month >= 4) { // May onwards
      return `${year}4`; // Summer term
    } else { // January to April
      return `${year}1`; // Winter term
    }
  }

  parseEnrolledCourses(courseText) {
    const courses = [];
    const lines = courseText.split('\n').map(line => line.trim()).filter(line => line);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const courseMatch = line.match(/^([A-Z]{4}\s+\d{3}[A-Z\-]*)/);
      
      if (courseMatch) {
        const courseCode = courseMatch[1];
        let section = '';
        
        // Look for section in same line or nearby lines
        const sectionMatch = line.match(/([A-Z]{2,3})\s*\((\d+)\)/);
        if (sectionMatch) {
          section = sectionMatch[2];
        }

        courses.push({
          code: courseCode.replace(/\s+/g, ' ').trim(),
          section: section,
          term: this.getCurrentTerm()
        });
      }
    }

    return courses;
  }
}

module.exports = new ScheduleService();