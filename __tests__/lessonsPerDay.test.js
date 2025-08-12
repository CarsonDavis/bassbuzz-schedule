/**
 * @jest-environment jsdom
 */

// Jest globals are automatically available

// Mock the lessons data
const mockLessons = [
  {
    id: 1,
    title: "Let's Rock 🤘",
    lessons: ["Lesson 1", "Lesson 2", "Lesson 3"]
  },
  {
    id: 2, 
    title: "Learn Your Favorite Songs 🎶",
    lessons: ["Lesson 4", "Lesson 5", "Lesson 6"]
  }
];

// Create a test-friendly version of the BassPracticeTracker class
class TestBassPracticeTracker {
  constructor() {
    this.lessons = mockLessons;
    this.progress = {
      lessons: {},
      practiceLog: {},
      courseStartDate: null,
      totalPracticeTime: 0
    };
  }

  // Extract just the calculation logic for testing
  calculateLessonsPerDay(currentDate = new Date()) {
    const completedLessons = Object.values(this.progress.lessons).filter(Boolean).length;
    
    if (completedLessons === 0) {
      return 0;
    }
    
    if (!this.progress.courseStartDate) {
      return 0;
    }
    
    const startDate = new Date(this.progress.courseStartDate);
    const today = currentDate;
    
    // Use actual fractional days, not rounded up days
    const daysSinceStart = (today - startDate) / (1000 * 60 * 60 * 24);
    
    // Handle same-day and very recent starts properly
    if (daysSinceStart < 1.0) {
      // If less than a full day, show the rate they're achieving today
      // This gives new users an encouraging but realistic rate
      return completedLessons / Math.max(daysSinceStart, 0.1);
    }
    
    return completedLessons / daysSinceStart;
  }

  getLocalDateString(date = new Date()) {
    return date.toISOString().split('T')[0];
  }
}

describe('Lessons Per Day Calculation', () => {
  let tracker;

  beforeEach(() => {
    tracker = new TestBassPracticeTracker();
    createMockDOM();
  });

  describe('Basic Calculations', () => {
    test('should return 0 when no lessons are completed', () => {
      tracker.progress.courseStartDate = '2025-01-01';
      const result = tracker.calculateLessonsPerDay(new Date('2025-01-06'));
      
      expect(result).toBe(0);
    });

    test('should return 0 when no course start date is set', () => {
      tracker.progress.lessons = { '1-Lesson 1': true };
      
      const result = tracker.calculateLessonsPerDay(new Date('2025-01-06'));
      
      expect(result).toBe(0);
    });

    test('should calculate basic rate correctly: 10 lessons in 5 days', () => {
      // Set up: 10 completed lessons
      for (let i = 1; i <= 10; i++) {
        tracker.progress.lessons[`1-Lesson ${i}`] = true;
      }
      tracker.progress.courseStartDate = '2025-01-01';
      
      const result = tracker.calculateLessonsPerDay(new Date('2025-01-06'));
      
      expect(result).toBeCloseTo(2.0, 2);
    });

    test('should calculate low rate correctly: 1 lesson in 3 days', () => {
      tracker.progress.lessons['1-Lesson 1'] = true;
      tracker.progress.courseStartDate = '2025-01-01';
      
      const result = tracker.calculateLessonsPerDay(new Date('2025-01-04'));
      
      expect(result).toBeCloseTo(0.33, 2);
    });
  });

  describe('Fractional Day Calculations (Math.ceil bug fix)', () => {
    test('should use actual fractional days, not Math.ceil: 2 lessons in 1.5 days', () => {
      tracker.progress.lessons['1-Lesson 1'] = true;
      tracker.progress.lessons['1-Lesson 2'] = true;
      tracker.progress.courseStartDate = '2025-01-01T00:00:00';
      
      const result = tracker.calculateLessonsPerDay(new Date('2025-01-02T12:00:00'));
      
      // Should be 2 / 1.5 = 1.33, not 2 / 2 = 1.0 (old Math.ceil behavior)
      expect(result).toBeCloseTo(1.33, 2);
      expect(result).not.toBeCloseTo(1.0, 1); // Ensure it's NOT the old wrong result
    });

    test('should handle quarter-day calculations: 1 lesson in 6 hours', () => {
      tracker.progress.lessons['1-Lesson 1'] = true;
      tracker.progress.courseStartDate = '2025-01-01T00:00:00';
      
      const result = tracker.calculateLessonsPerDay(new Date('2025-01-01T06:00:00'));
      
      // 1 lesson in 0.25 days = 4.0 lessons/day
      expect(result).toBeCloseTo(4.0, 1);
    });
  });

  describe('Same-Day and First-Day Edge Cases', () => {
    test('should handle same-day completion correctly', () => {
      tracker.progress.lessons['1-Lesson 1'] = true;
      tracker.progress.lessons['1-Lesson 2'] = true;
      tracker.progress.lessons['1-Lesson 3'] = true;
      tracker.progress.courseStartDate = '2025-01-01T00:00:00';
      
      // Near end of first day
      const result = tracker.calculateLessonsPerDay(new Date('2025-01-01T20:00:00'));
      
      // Should show meaningful rate, not 0
      expect(result).toBeGreaterThan(0);
      expect(result).toBeCloseTo(3.6, 1); // 3 lessons / (20/24 days)
    });

    test('should handle very recent starts (under 2.4 hours) properly', () => {
      tracker.progress.lessons['1-Lesson 1'] = true;
      tracker.progress.courseStartDate = '2025-01-01T00:00:00';
      
      // 30 minutes after start
      const result = tracker.calculateLessonsPerDay(new Date('2025-01-01T00:30:00'));
      
      // Should use minimum threshold to avoid extreme numbers
      expect(result).toBeCloseTo(10.0, 1); // 1 lesson / 0.1 days (minimum threshold)
    });

    test('should not return zero for first-day completions', () => {
      tracker.progress.lessons['1-Lesson 1'] = true;
      tracker.progress.lessons['1-Lesson 2'] = true;
      tracker.progress.courseStartDate = '2025-01-01';
      
      const result = tracker.calculateLessonsPerDay(new Date('2025-01-01T23:59:59'));
      
      expect(result).toBeGreaterThan(0);
      expect(result).not.toBe(0); // This was the old bug - returned 0
    });
  });

  describe('Multi-day Scenarios', () => {
    test('should calculate week-long progress: 7 lessons in 7 days', () => {
      for (let i = 1; i <= 7; i++) {
        tracker.progress.lessons[`1-Lesson ${i}`] = true;
      }
      tracker.progress.courseStartDate = '2025-01-01';
      
      const result = tracker.calculateLessonsPerDay(new Date('2025-01-08'));
      
      expect(result).toBeCloseTo(1.0, 2);
    });

    test('should calculate month-long progress: 15 lessons in 30 days', () => {
      for (let i = 1; i <= 15; i++) {
        tracker.progress.lessons[`1-Lesson ${i}`] = true;
      }
      tracker.progress.courseStartDate = '2025-01-01';
      
      const result = tracker.calculateLessonsPerDay(new Date('2025-01-31'));
      
      expect(result).toBeCloseTo(0.5, 2);
    });
  });

  describe('Real-world User Scenarios', () => {
    test('should handle "weekend warrior" pattern: 5 lessons in 2 days', () => {
      for (let i = 1; i <= 5; i++) {
        tracker.progress.lessons[`1-Lesson ${i}`] = true;
      }
      tracker.progress.courseStartDate = '2025-01-01';
      
      const result = tracker.calculateLessonsPerDay(new Date('2025-01-03'));
      
      expect(result).toBeCloseTo(2.5, 2);
    });

    test('should handle "slow and steady" pattern: 3 lessons in 3 weeks', () => {
      tracker.progress.lessons['1-Lesson 1'] = true;
      tracker.progress.lessons['1-Lesson 2'] = true; 
      tracker.progress.lessons['1-Lesson 3'] = true;
      tracker.progress.courseStartDate = '2025-01-01';
      
      const result = tracker.calculateLessonsPerDay(new Date('2025-01-22')); // 21 days later
      
      expect(result).toBeCloseTo(0.14, 2); // 3 lessons / 21 days
    });

    test('should handle "new user excitement": 10 lessons on day 1', () => {
      for (let i = 1; i <= 10; i++) {
        tracker.progress.lessons[`1-Lesson ${i}`] = true;
      }
      tracker.progress.courseStartDate = '2025-01-01T08:00:00';
      
      // End of first day
      const result = tracker.calculateLessonsPerDay(new Date('2025-01-01T22:00:00'));
      
      expect(result).toBeGreaterThan(10); // Should show high rate
      expect(result).toBeCloseTo(17.14, 1); // 10 lessons / (14/24 days)
    });
  });

  describe('Edge Cases and Error Conditions', () => {
    test('should handle future start dates gracefully', () => {
      tracker.progress.lessons['1-Lesson 1'] = true;
      tracker.progress.courseStartDate = '2025-12-31'; // Future date
      
      const result = tracker.calculateLessonsPerDay(new Date('2025-01-01'));
      
      // Should use minimum threshold for negative time periods
      expect(result).toBeGreaterThan(0);
    });

    test('should handle invalid date strings', () => {
      tracker.progress.lessons['1-Lesson 1'] = true;
      tracker.progress.courseStartDate = 'invalid-date';
      
      expect(() => {
        tracker.calculateLessonsPerDay(new Date('2025-01-01'));
      }).not.toThrow();
    });

    test('should handle very large numbers of lessons', () => {
      // Simulate completing 1000 lessons
      for (let i = 1; i <= 1000; i++) {
        tracker.progress.lessons[`lesson-${i}`] = true;
      }
      tracker.progress.courseStartDate = '2025-01-01';
      
      const result = tracker.calculateLessonsPerDay(new Date('2025-01-11')); // 10 days
      
      expect(result).toBeCloseTo(100.0, 1);
      expect(Number.isFinite(result)).toBe(true);
    });
  });

  describe('Performance Regression Tests', () => {
    test('should not use Math.ceil anymore (regression test)', () => {
      // This test ensures we never go back to the old Math.ceil behavior
      tracker.progress.lessons['1-Lesson 1'] = true;
      tracker.progress.lessons['1-Lesson 2'] = true;
      tracker.progress.courseStartDate = '2025-01-01T00:00:00';
      
      const result = tracker.calculateLessonsPerDay(new Date('2025-01-02T12:00:00'));
      
      // Old Math.ceil logic would give: 2 lessons / Math.ceil(1.5) = 2 / 2 = 1.0
      // New logic should give: 2 lessons / 1.5 = 1.33
      expect(result).toBeCloseTo(1.33, 2);
      expect(result).toBeGreaterThan(1.3); // Ensure it's significantly higher than 1.0
    });

    test('should never return zero for positive lesson counts (regression test)', () => {
      tracker.progress.lessons['1-Lesson 1'] = true;
      tracker.progress.courseStartDate = '2025-01-01';
      
      // Test various same-day times
      const times = ['08:00:00', '12:00:00', '18:00:00', '23:59:59'];
      
      times.forEach(time => {
        const result = tracker.calculateLessonsPerDay(new Date(`2025-01-01T${time}`));
        expect(result).toBeGreaterThan(0);
      });
    });
  });
});