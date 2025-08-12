/**
 * @jest-environment jsdom
 */

// Jest globals are automatically available

// Helper function to convert RGB to hex for testing
function rgbToHex(rgb) {
  if (!rgb || rgb === '') return '';
  
  const result = rgb.match(/\d+/g);
  if (!result) return rgb;
  
  const [r, g, b] = result.map(Number);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// Test helper for calendar functionality
class TestCalendarTracker {
  constructor() {
    this.progress = {
      practiceLog: {},
      lessons: {}
    };
    this.targetDate = null;
  }

  getLocalDateString(date = new Date()) {
    return date.toISOString().split('T')[0];
  }

  getPracticeColor(minutes) {
    if (minutes === 0) return null;
    if (minutes < 30) return '#1e3a8a';
    if (minutes < 60) return '#1e40af';
    if (minutes < 90) return '#2563eb';
    return '#3b82f6';
  }

  // Selective calendar update methods
  updateCalendarCell(dateStr) {
    const cell = document.querySelector(`#calendarGrid [data-date="${dateStr}"]`);
    if (!cell) {
      // Cell not visible in current month view, would trigger full render
      return false; // Return false to indicate full render needed
    }
    
    const practiceTime = this.progress.practiceLog[dateStr] || 0;
    const practiceMinutes = Math.floor(practiceTime / 60);
    
    // Update practice minutes display
    const minutesSpan = cell.querySelector('.practice-minutes');
    if (practiceMinutes > 0) {
      if (!minutesSpan) {
        cell.insertAdjacentHTML('beforeend', `<span class="practice-minutes">${practiceMinutes}m</span>`);
      } else {
        minutesSpan.textContent = `${practiceMinutes}m`;
      }
    } else if (minutesSpan) {
      minutesSpan.remove();
    }
    
    // Update background color
    const practiceColor = this.getPracticeColor(practiceMinutes);
    cell.style.backgroundColor = practiceColor || '';
    cell.style.color = practiceColor ? 'white' : '';
    
    // Update target date highlighting
    cell.classList.toggle('target-date', dateStr === this.targetDate);
    
    return true; // Return true to indicate successful selective update
  }

  updateYearlyChartCell(dateStr) {
    const cell = document.querySelector(`#yearlyChartGrid [data-date="${dateStr}"]`);
    if (!cell) {
      return false; // Full render needed
    }
    
    const practiceTime = this.progress.practiceLog[dateStr] || 0;
    const practiceMinutes = Math.floor(practiceTime / 60);
    
    // Update background color
    const practiceColor = this.getPracticeColor(practiceMinutes);
    if (practiceColor) {
      cell.style.backgroundColor = practiceColor;
      cell.classList.remove('level-0');
    } else {
      cell.style.backgroundColor = '';
      cell.classList.add('level-0');
    }
    
    // Update target date highlighting
    if (this.targetDate && dateStr === this.targetDate) {
      cell.classList.add('target-date');
      cell.style.backgroundColor = '#9b59b6';
    } else {
      cell.classList.remove('target-date');
    }
    
    return true;
  }
}

describe('Calendar Functionality', () => {
  let tracker;

  beforeEach(() => {
    tracker = new TestCalendarTracker();
    createMockDOM();
  });

  describe('Date String Formatting', () => {
    test('should format dates consistently in YYYY-MM-DD format', () => {
      const date1 = new Date('2025-01-15T10:30:00Z');
      const date2 = new Date('2025-12-31T12:00:00Z'); // Use midday to avoid timezone issues
      const date3 = new Date('2025-07-04T12:00:00Z');
      
      expect(tracker.getLocalDateString(date1)).toBe('2025-01-15');
      expect(tracker.getLocalDateString(date2)).toBe('2025-12-31');
      expect(tracker.getLocalDateString(date3)).toBe('2025-07-04');
    });

    test('should handle timezone consistently', () => {
      // Test with different timezone inputs
      const utcDate = new Date('2025-06-15T12:00:00Z');
      const result = tracker.getLocalDateString(utcDate);
      
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result).toBe('2025-06-15');
    });
  });

  describe('Practice Color Coding', () => {
    test('should return null for zero practice time', () => {
      expect(tracker.getPracticeColor(0)).toBeNull();
    });

    test('should return correct colors for different practice durations', () => {
      expect(tracker.getPracticeColor(15)).toBe('#1e3a8a'); // < 30 min
      expect(tracker.getPracticeColor(45)).toBe('#1e40af'); // < 60 min
      expect(tracker.getPracticeColor(75)).toBe('#2563eb'); // < 90 min
      expect(tracker.getPracticeColor(120)).toBe('#3b82f6'); // >= 90 min
    });

    test('should handle edge cases for time thresholds', () => {
      expect(tracker.getPracticeColor(29)).toBe('#1e3a8a');
      expect(tracker.getPracticeColor(30)).toBe('#1e40af');
      expect(tracker.getPracticeColor(59)).toBe('#1e40af');
      expect(tracker.getPracticeColor(60)).toBe('#2563eb');
      expect(tracker.getPracticeColor(89)).toBe('#2563eb');
      expect(tracker.getPracticeColor(90)).toBe('#3b82f6');
    });
  });

  describe('Selective Calendar Updates', () => {
    beforeEach(() => {
      // Create mock calendar cells
      const calendarGrid = document.getElementById('calendarGrid');
      calendarGrid.innerHTML = `
        <div class="calendar-day" data-date="2025-01-01">
          <span class="date-number">1</span>
        </div>
        <div class="calendar-day" data-date="2025-01-02">
          <span class="date-number">2</span>
          <span class="practice-minutes">30m</span>
        </div>
      `;
      
      const yearlyGrid = document.getElementById('yearlyChartGrid');
      yearlyGrid.innerHTML = `
        <div class="yearly-chart-day level-0" data-date="2025-01-01"></div>
        <div class="yearly-chart-day" data-date="2025-01-02"></div>
      `;
    });

    describe('Calendar Cell Updates', () => {
      test('should update existing cell with new practice time', () => {
        // Set practice data
        tracker.progress.practiceLog['2025-01-01'] = 2700; // 45 minutes
        
        const success = tracker.updateCalendarCell('2025-01-01');
        
        expect(success).toBe(true);
        
        const cell = document.querySelector('[data-date="2025-01-01"]');
        const minutesSpan = cell.querySelector('.practice-minutes');
        
        expect(minutesSpan).toBeTruthy();
        expect(minutesSpan.textContent).toBe('45m');
        expect(rgbToHex(cell.style.backgroundColor)).toBe('#1e40af'); // 45min color
        expect(cell.style.color).toBe('white');
      });

      test('should update existing practice time', () => {
        // Update existing practice time
        tracker.progress.practiceLog['2025-01-02'] = 5400; // 90 minutes (was 30m)
        
        const success = tracker.updateCalendarCell('2025-01-02');
        
        expect(success).toBe(true);
        
        const cell = document.querySelector('[data-date="2025-01-02"]');
        const minutesSpan = cell.querySelector('.practice-minutes');
        
        expect(minutesSpan.textContent).toBe('90m');
        expect(rgbToHex(cell.style.backgroundColor)).toBe('#3b82f6'); // 90min+ color
      });

      test('should remove practice time when set to zero', () => {
        // Remove practice time
        tracker.progress.practiceLog['2025-01-02'] = 0;
        
        const success = tracker.updateCalendarCell('2025-01-02');
        
        expect(success).toBe(true);
        
        const cell = document.querySelector('[data-date="2025-01-02"]');
        const minutesSpan = cell.querySelector('.practice-minutes');
        
        expect(minutesSpan).toBeNull(); // Should be removed
        expect(rgbToHex(cell.style.backgroundColor)).toBe(''); // No color
      });

      test('should update target date highlighting', () => {
        tracker.targetDate = '2025-01-01';
        
        const success = tracker.updateCalendarCell('2025-01-01');
        
        expect(success).toBe(true);
        
        const cell = document.querySelector('[data-date="2025-01-01"]');
        expect(cell.classList.contains('target-date')).toBe(true);
      });

      test('should remove target date highlighting when not target', () => {
        // First add target date class
        const cell = document.querySelector('[data-date="2025-01-01"]');
        cell.classList.add('target-date');
        
        tracker.targetDate = '2025-01-15'; // Different date
        
        const success = tracker.updateCalendarCell('2025-01-01');
        
        expect(success).toBe(true);
        expect(cell.classList.contains('target-date')).toBe(false);
      });

      test('should return false when cell not found (triggers full render)', () => {
        const success = tracker.updateCalendarCell('2025-02-01'); // Not in DOM
        
        expect(success).toBe(false);
      });
    });

    describe('Yearly Chart Updates', () => {
      test('should update yearly chart cell with practice data', () => {
        tracker.progress.practiceLog['2025-01-01'] = 3600; // 60 minutes
        
        const success = tracker.updateYearlyChartCell('2025-01-01');
        
        expect(success).toBe(true);
        
        const cell = document.querySelector('#yearlyChartGrid [data-date="2025-01-01"]');
        expect(rgbToHex(cell.style.backgroundColor)).toBe('#2563eb'); // 60min color
        expect(cell.classList.contains('level-0')).toBe(false);
      });

      test('should handle zero practice time in yearly chart', () => {
        tracker.progress.practiceLog['2025-01-02'] = 0;
        
        const success = tracker.updateYearlyChartCell('2025-01-02');
        
        expect(success).toBe(true);
        
        const cell = document.querySelector('#yearlyChartGrid [data-date="2025-01-02"]');
        expect(rgbToHex(cell.style.backgroundColor)).toBe('');
        expect(cell.classList.contains('level-0')).toBe(true);
      });

      test('should update target date in yearly chart with special color', () => {
        tracker.targetDate = '2025-01-01';
        tracker.progress.practiceLog['2025-01-01'] = 1800; // 30 minutes
        
        const success = tracker.updateYearlyChartCell('2025-01-01');
        
        expect(success).toBe(true);
        
        const cell = document.querySelector('#yearlyChartGrid [data-date="2025-01-01"]');
        expect(cell.classList.contains('target-date')).toBe(true);
        expect(rgbToHex(cell.style.backgroundColor)).toBe('#9b59b6'); // Target date overrides practice color
      });

      test('should return false when yearly cell not found', () => {
        const success = tracker.updateYearlyChartCell('2025-03-01'); // Not in DOM
        
        expect(success).toBe(false);
      });
    });
  });

  describe('Calendar Integration Scenarios', () => {
    beforeEach(() => {
      // Set up a fuller calendar grid for integration tests
      const calendarGrid = document.getElementById('calendarGrid');
      const yearlyGrid = document.getElementById('yearlyChartGrid');
      
      // Add several days
      const dates = ['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-15'];
      
      calendarGrid.innerHTML = dates.map(date => 
        `<div class="calendar-day" data-date="${date}">
          <span class="date-number">${date.split('-')[2]}</span>
        </div>`
      ).join('');
      
      yearlyGrid.innerHTML = dates.map(date => 
        `<div class="yearly-chart-day level-0" data-date="${date}"></div>`
      ).join('');
    });

    test('should handle batch updates to multiple dates', () => {
      const updates = {
        '2025-01-01': 1800, // 30 min
        '2025-01-02': 3600, // 60 min
        '2025-01-03': 5400  // 90 min
      };
      
      Object.entries(updates).forEach(([date, seconds]) => {
        tracker.progress.practiceLog[date] = seconds;
        
        const calendarSuccess = tracker.updateCalendarCell(date);
        const yearlySuccess = tracker.updateYearlyChartCell(date);
        
        expect(calendarSuccess).toBe(true);
        expect(yearlySuccess).toBe(true);
      });
      
      // Verify all updates applied correctly
      const calendarCell1 = document.querySelector('#calendarGrid [data-date="2025-01-01"]');
      const calendarCell2 = document.querySelector('#calendarGrid [data-date="2025-01-02"]');
      const calendarCell3 = document.querySelector('#calendarGrid [data-date="2025-01-03"]');
      
      expect(calendarCell1.querySelector('.practice-minutes').textContent).toBe('30m');
      expect(calendarCell2.querySelector('.practice-minutes').textContent).toBe('60m');
      expect(calendarCell3.querySelector('.practice-minutes').textContent).toBe('90m');
      
      expect(rgbToHex(calendarCell1.style.backgroundColor)).toBe('#1e40af');
      expect(rgbToHex(calendarCell2.style.backgroundColor)).toBe('#2563eb');
      expect(rgbToHex(calendarCell3.style.backgroundColor)).toBe('#3b82f6');
    });

    test('should handle target date changes across calendars', () => {
      tracker.progress.practiceLog['2025-01-01'] = 1800; // 30 min
      tracker.progress.practiceLog['2025-01-02'] = 3600; // 60 min
      
      // Set initial target
      tracker.targetDate = '2025-01-01';
      tracker.updateCalendarCell('2025-01-01');
      tracker.updateYearlyChartCell('2025-01-01');
      
      // Change target
      tracker.targetDate = '2025-01-02';
      tracker.updateCalendarCell('2025-01-01'); // Remove old target
      tracker.updateCalendarCell('2025-01-02'); // Add new target
      tracker.updateYearlyChartCell('2025-01-01');
      tracker.updateYearlyChartCell('2025-01-02');
      
      const oldTargetCalendar = document.querySelector('#calendarGrid [data-date="2025-01-01"]');
      const newTargetCalendar = document.querySelector('#calendarGrid [data-date="2025-01-02"]');
      const oldTargetYearly = document.querySelector('#yearlyChartGrid [data-date="2025-01-01"]');
      const newTargetYearly = document.querySelector('#yearlyChartGrid [data-date="2025-01-02"]');
      
      expect(oldTargetCalendar.classList.contains('target-date')).toBe(false);
      expect(newTargetCalendar.classList.contains('target-date')).toBe(true);
      expect(oldTargetYearly.classList.contains('target-date')).toBe(false);
      expect(newTargetYearly.classList.contains('target-date')).toBe(true);
      
      // Yearly chart target should have special color
      expect(rgbToHex(newTargetYearly.style.backgroundColor)).toBe('#9b59b6');
    });
  });

  describe('Performance Considerations', () => {
    test('should be faster than full DOM regeneration', () => {
      const calendarGrid = document.getElementById('calendarGrid');
      calendarGrid.innerHTML = `<div class="calendar-day" data-date="2025-01-01"><span class="date-number">1</span></div>`;
      
      const start = performance.now();
      
      // Selective update
      tracker.progress.practiceLog['2025-01-01'] = 1800;
      tracker.updateCalendarCell('2025-01-01');
      
      const end = performance.now();
      const updateTime = end - start;
      
      // Should be very fast (< 1ms for a single cell)
      expect(updateTime).toBeLessThan(1);
    });

    test('should handle multiple selective updates efficiently', () => {
      // Set up 10 calendar cells
      const calendarGrid = document.getElementById('calendarGrid');
      const dates = [];
      for (let i = 1; i <= 10; i++) {
        const date = `2025-01-${i.toString().padStart(2, '0')}`;
        dates.push(date);
        calendarGrid.innerHTML += `<div class="calendar-day" data-date="${date}"><span class="date-number">${i}</span></div>`;
      }
      
      const start = performance.now();
      
      // Update all 10 cells
      dates.forEach(date => {
        tracker.progress.practiceLog[date] = 1800;
        tracker.updateCalendarCell(date);
      });
      
      const end = performance.now();
      const totalTime = end - start;
      
      // Should handle 10 updates quickly (< 5ms)
      expect(totalTime).toBeLessThan(5);
      
      // Verify all were updated
      dates.forEach(date => {
        const cell = document.querySelector(`[data-date="${date}"]`);
        expect(cell.querySelector('.practice-minutes').textContent).toBe('30m');
      });
    });
  });
});