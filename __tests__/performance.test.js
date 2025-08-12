/**
 * @jest-environment jsdom
 */

// Jest globals are automatically available

// Mock performance.now for consistent timing tests
const mockPerformance = {
  now: jest.fn()
};
global.performance = mockPerformance;

// Test helper to create a minimal tracker with performance optimizations
class TestPerformanceTracker {
  constructor() {
    this.renderTimeout = null;
    this.lessonUpdateTimeout = null;
    this.lastTargetInputs = null;
    this.progress = { lessons: {}, practiceLog: {}, courseStartDate: null, totalPracticeTime: 0 };
    this.renderCount = 0;
    this.updateCount = 0;
  }

  // Mock expensive operations to track calls
  renderCalendar() {
    this.renderCount++;
    return 'calendar-rendered';
  }

  renderYearlyChart() {
    this.renderCount++;
    return 'yearly-chart-rendered';
  }

  updateStatsDisplay() {
    this.updateCount++;
  }

  saveProgress() {
    this.updateCount++;
  }

  // Performance optimization methods (copied from real implementation)
  scheduleRender() {
    if (this.renderTimeout) return; // Already scheduled
    
    this.renderTimeout = setTimeout(() => {
      this.renderCalendar();
      this.renderYearlyChart();
      this.renderTimeout = null;
    }, 50); // 50ms debounce
  }

  scheduleLessonUpdate() {
    if (this.lessonUpdateTimeout) return; // Already scheduled
    
    this.lessonUpdateTimeout = setTimeout(() => {
      // Batch all the expensive operations
      this.saveProgress();
      this.updateStatsDisplay();
      this.scheduleRender(); // This will also be debounced
      this.lessonUpdateTimeout = null;
    }, 100); // 100ms debounce for lesson updates
  }

  calculateTargetDate() {
    // Cached calculation logic
    const currentInputs = JSON.stringify({
      lessons: Object.keys(this.progress.lessons).length,
      practiceLog: Object.keys(this.progress.practiceLog).length,
      startDate: this.progress.courseStartDate,
      totalPracticeTime: this.progress.totalPracticeTime
    });
    
    if (this.lastTargetInputs === currentInputs) {
      return; // No changes, skip calculation
    }
    
    this.lastTargetInputs = currentInputs;
    // Simulate calculation work
    return new Date().toISOString().split('T')[0];
  }
}

describe('Performance Optimizations', () => {
  let tracker;

  beforeEach(() => {
    tracker = new TestPerformanceTracker();
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Render Debouncing', () => {
    test('should debounce multiple render calls into single operation', () => {
      // Call scheduleRender multiple times rapidly
      tracker.scheduleRender();
      tracker.scheduleRender();
      tracker.scheduleRender();
      
      // Should not have rendered yet
      expect(tracker.renderCount).toBe(0);
      
      // Fast-forward past debounce timeout
      jest.advanceTimersByTime(60);
      
      // Should have rendered only once despite multiple calls
      expect(tracker.renderCount).toBe(2); // renderCalendar + renderYearlyChart
    });

    test('should prevent duplicate renders when called multiple times', () => {
      // The actual implementation doesn't reset the timer, it just ignores
      // additional calls while a render is already scheduled
      tracker.scheduleRender();
      tracker.scheduleRender();
      tracker.scheduleRender();
      
      expect(tracker.renderCount).toBe(0);
      
      // Advance past timeout
      jest.advanceTimersByTime(60);
      
      // Should only render once despite multiple calls
      expect(tracker.renderCount).toBe(2); // renderCalendar + renderYearlyChart
    });

    test('should allow new renders after previous debounce completes', () => {
      // First batch
      tracker.scheduleRender();
      jest.advanceTimersByTime(60);
      expect(tracker.renderCount).toBe(2);
      
      // Second batch should work
      tracker.scheduleRender();
      jest.advanceTimersByTime(60);
      expect(tracker.renderCount).toBe(4);
    });
  });

  describe('Lesson Update Batching', () => {
    test('should batch multiple lesson updates into single operation', () => {
      // Simulate rapid lesson checkbox clicking
      tracker.scheduleLessonUpdate();
      tracker.scheduleLessonUpdate();
      tracker.scheduleLessonUpdate();
      
      expect(tracker.updateCount).toBe(0);
      expect(tracker.renderCount).toBe(0);
      
      // Fast-forward past lesson update timeout
      jest.advanceTimersByTime(110);
      
      // Should have done updates only once
      expect(tracker.updateCount).toBe(2); // saveProgress + updateStatsDisplay
      
      // And scheduled a render (advance render timeout too)
      jest.advanceTimersByTime(60);
      expect(tracker.renderCount).toBe(2); // renderCalendar + renderYearlyChart
    });

    test('should use longer timeout for lesson updates than renders', () => {
      tracker.scheduleLessonUpdate();
      
      // Advance past render timeout but not lesson timeout
      jest.advanceTimersByTime(60);
      expect(tracker.updateCount).toBe(0);
      
      // Advance to lesson timeout
      jest.advanceTimersByTime(50);
      expect(tracker.updateCount).toBe(2);
    });
  });

  describe('Target Date Calculation Caching', () => {
    test('should skip calculation when inputs have not changed', () => {
      // Set up initial state
      tracker.progress.lessons['lesson1'] = true;
      tracker.progress.courseStartDate = '2025-01-01';
      
      // First calculation should run
      const result1 = tracker.calculateTargetDate();
      expect(result1).toBeDefined();
      expect(tracker.lastTargetInputs).toBeTruthy();
      
      // Second calculation with same inputs should skip
      const result2 = tracker.calculateTargetDate();
      expect(result2).toBeUndefined(); // Returns undefined when skipped
    });

    test('should recalculate when inputs change', () => {
      // Initial state
      tracker.progress.lessons['lesson1'] = true;
      tracker.calculateTargetDate();
      const firstInputs = tracker.lastTargetInputs;
      
      // Change lessons
      tracker.progress.lessons['lesson2'] = true;
      tracker.calculateTargetDate();
      const secondInputs = tracker.lastTargetInputs;
      
      expect(firstInputs).not.toEqual(secondInputs);
    });

    test('should detect changes in all relevant inputs', () => {
      const initialState = () => tracker.calculateTargetDate();
      
      // Test each input type
      tracker.progress.lessons = {};
      initialState();
      const baseline = tracker.lastTargetInputs;
      
      // Change lessons count
      tracker.progress.lessons['lesson1'] = true;
      tracker.calculateTargetDate();
      expect(tracker.lastTargetInputs).not.toEqual(baseline);
      
      // Change practice log count
      tracker.lastTargetInputs = baseline;
      tracker.progress.practiceLog['2025-01-01'] = 1800;
      tracker.calculateTargetDate();
      expect(tracker.lastTargetInputs).not.toEqual(baseline);
      
      // Change start date
      tracker.lastTargetInputs = baseline;
      tracker.progress.courseStartDate = '2025-01-02';
      tracker.calculateTargetDate();
      expect(tracker.lastTargetInputs).not.toEqual(baseline);
      
      // Change total practice time
      tracker.lastTargetInputs = baseline;
      tracker.progress.totalPracticeTime = 7200;
      tracker.calculateTargetDate();
      expect(tracker.lastTargetInputs).not.toEqual(baseline);
    });
  });

  describe('Performance Regression Tests', () => {
    test('should prevent render timeout memory leaks', () => {
      // Schedule renders
      tracker.scheduleRender();
      expect(tracker.renderTimeout).toBeTruthy();
      
      // Complete timeout
      jest.advanceTimersByTime(60);
      expect(tracker.renderTimeout).toBeNull(); // Should clear timeout reference
    });

    test('should prevent lesson update timeout memory leaks', () => {
      tracker.scheduleLessonUpdate();
      expect(tracker.lessonUpdateTimeout).toBeTruthy();
      
      jest.advanceTimersByTime(110);
      expect(tracker.lessonUpdateTimeout).toBeNull();
    });

    test('should handle high-frequency updates efficiently', () => {
      const startTime = Date.now();
      
      // Simulate 50 rapid lesson updates
      for (let i = 0; i < 50; i++) {
        tracker.scheduleLessonUpdate();
      }
      
      const scheduleTime = Date.now() - startTime;
      
      // Should complete scheduling quickly (under 10ms for 50 calls)
      expect(scheduleTime).toBeLessThan(10);
      
      // Should still only trigger once
      jest.advanceTimersByTime(200);
      expect(tracker.updateCount).toBe(2); // Only one batch execution
    });
  });

  describe('Edge Cases', () => {
    test('should handle overlapping render and lesson update timeouts', () => {
      // Schedule both types
      tracker.scheduleRender();
      tracker.scheduleLessonUpdate();
      
      // Advance to render timeout first
      jest.advanceTimersByTime(60);
      expect(tracker.renderCount).toBe(2); // Direct render
      
      // Complete lesson timeout (which also schedules render)
      jest.advanceTimersByTime(50);
      expect(tracker.updateCount).toBe(2);
      
      // Advance render timeout from lesson update
      jest.advanceTimersByTime(60);
      expect(tracker.renderCount).toBe(4); // Second render from lesson update
    });

    test('should handle timeout clearing when tracker is destroyed', () => {
      tracker.scheduleRender();
      tracker.scheduleLessonUpdate();
      
      // Simulate cleanup (like component unmount)
      if (tracker.renderTimeout) {
        clearTimeout(tracker.renderTimeout);
        tracker.renderTimeout = null;
      }
      if (tracker.lessonUpdateTimeout) {
        clearTimeout(tracker.lessonUpdateTimeout);
        tracker.lessonUpdateTimeout = null;
      }
      
      // Advance timers - should not execute callbacks
      jest.advanceTimersByTime(200);
      expect(tracker.renderCount).toBe(0);
      expect(tracker.updateCount).toBe(0);
    });
  });

  describe('Performance Metrics', () => {
    test('should reduce DOM operations by 90% for lesson updates', () => {
      // Simulate old behavior (immediate operations)
      const oldOperations = 50 * 4; // 50 updates × 4 operations each
      
      // New behavior (batched)
      for (let i = 0; i < 50; i++) {
        tracker.scheduleLessonUpdate();
      }
      jest.advanceTimersByTime(200);
      
      const newOperations = tracker.updateCount + tracker.renderCount;
      const reduction = ((oldOperations - newOperations) / oldOperations) * 100;
      
      expect(reduction).toBeGreaterThan(90); // Should be >90% reduction
    });

    test('should batch calendar renders efficiently', () => {
      // Old: every change triggers immediate render (2 operations each)
      const oldRenderCount = 20 * 2; // 20 changes × 2 renders each
      
      // New: 20 changes batched into single render
      for (let i = 0; i < 20; i++) {
        tracker.scheduleRender();
      }
      jest.advanceTimersByTime(60);
      
      const improvement = oldRenderCount / tracker.renderCount;
      expect(improvement).toBeGreaterThan(10); // 10x improvement
    });
  });
});