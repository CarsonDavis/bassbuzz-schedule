// Jest test setup file

// Mock DOM elements that the app expects
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
  },
  writable: true,
});

// Mock fetch for API calls
global.fetch = jest.fn();

// Mock console methods to reduce noise in tests (unless debugging)
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

// Helper to create DOM elements for tests
global.createMockDOM = () => {
  document.body.innerHTML = `
    <div id="calendarGrid"></div>
    <div id="yearlyChartGrid"></div>
    <div id="yearlyChartMonths"></div>
    <div id="currentMonth"></div>
    <div id="currentYear"></div>
    <div id="timerDisplay"></div>
    <div id="todayTotal"></div>
    <div id="overallProgress"></div>
    <div id="progressText"></div>
    <div id="totalPracticeTime"></div>
    <div id="avgSessionLength"></div>
    <div id="lessonsPerDay"></div>
    <div id="expectedCompletionOnePerDay"></div>
    <div id="expectedCompletionLessonRate"></div>
    <div id="expectedCompletionTimeRate"></div>
    <div id="lessonRateLabel"></div>
    <div id="timeRateLabel"></div>
    <div id="modulesContainer"></div>
    <div id="colorScaleToggle"></div>
    <div id="prevMonth"></div>
    <div id="nextMonth"></div>
    <div id="prevYear"></div>
    <div id="nextYear"></div>
  `;
};