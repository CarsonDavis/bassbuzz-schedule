/**
 * @jest-environment jsdom
 */

// Loads the real BassPracticeTracker class (script.js is not a module) and
// checks the practice-day boundary: a session saved before 5am counts for the
// previous calendar day, and explicitly passed dates are never shifted.

const fs = require('fs');
const path = require('path');

let BassPracticeTracker;

beforeAll(() => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
  // Expose the class without running the DOMContentLoaded bootstrap.
  BassPracticeTracker = new Function(`${source}\nreturn BassPracticeTracker;`)();
});

afterEach(() => {
  jest.useRealTimers();
});

function at(isoLocal) {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(isoLocal));
}

describe('Practice day boundary', () => {
  test('day starts at 5am', () => {
    expect(BassPracticeTracker.DAY_STARTS_AT_HOUR).toBe(5);
  });

  test('a 4am session counts for the previous day', () => {
    at('2026-11-06T04:10:00');
    expect(BassPracticeTracker.prototype.getLocalDateString()).toBe('2026-11-05');
  });

  test('a 4:59am session still counts for the previous day', () => {
    at('2026-11-06T04:59:59');
    expect(BassPracticeTracker.prototype.getLocalDateString()).toBe('2026-11-05');
  });

  test('a 5am session counts for the current day', () => {
    at('2026-11-06T05:00:00');
    expect(BassPracticeTracker.prototype.getLocalDateString()).toBe('2026-11-06');
  });

  test('an evening session counts for the current day', () => {
    at('2026-11-06T21:30:00');
    expect(BassPracticeTracker.prototype.getLocalDateString()).toBe('2026-11-06');
  });

  test('crosses a month boundary', () => {
    at('2026-12-01T02:00:00');
    expect(BassPracticeTracker.prototype.getLocalDateString()).toBe('2026-11-30');
  });

  test('an explicit date is formatted as given, never shifted', () => {
    at('2026-11-06T04:10:00');
    const cell = new Date(2026, 10, 6, 1, 0, 0);
    expect(BassPracticeTracker.prototype.getLocalDateString(cell)).toBe('2026-11-06');
  });
});
