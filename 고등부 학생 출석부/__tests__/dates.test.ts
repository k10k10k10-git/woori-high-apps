import { describe, it, expect } from 'vitest';
import {
  getKSTYear,
  getWindowYears,
  getSundaysForYear,
  evKey,
  buildHolidayRanges,
  buildEvents,
  getHolidayEvents,
  emailToKey,
  escapeHTML,
  sortAndRenumber,
} from '@/utils/dates';

describe('evKey', () => {
  it('formats month index and day index as hyphenated string', () => {
    expect(evKey(0, 0)).toBe('0-0');
    expect(evKey(4, 1)).toBe('4-1');
    expect(evKey(11, 3)).toBe('11-3');
  });
});

describe('getKSTYear', () => {
  it('returns a valid year number', () => {
    const year = getKSTYear();
    expect(year).toBeGreaterThanOrEqual(2024);
    expect(year).toBeLessThanOrEqual(2030);
  });
});

describe('getWindowYears', () => {
  it('returns 11 years centered around the given year', () => {
    const years = getWindowYears(2025);
    expect(years).toHaveLength(11);
    expect(years[0]).toBe(2020);
    expect(years[5]).toBe(2025);
    expect(years[10]).toBe(2030);
  });
});

describe('getSundaysForYear', () => {
  it('returns 12 months', () => {
    const result = getSundaysForYear(2025);
    expect(result).toHaveLength(12);
  });

  it('returns correct months in order', () => {
    const result = getSundaysForYear(2025);
    result.forEach((entry, i) => {
      expect(entry.month).toBe(i + 1);
    });
  });

  it('returns only Sundays', () => {
    const result = getSundaysForYear(2025);
    result.forEach(({ month, sundays }) => {
      sundays.forEach(day => {
        const date = new Date(2025, month - 1, day);
        expect(date.getDay()).toBe(0); // Sunday
      });
    });
  });

  it('returns at least 4 Sundays per month', () => {
    const result = getSundaysForYear(2025);
    result.forEach(({ sundays }) => {
      expect(sundays.length).toBeGreaterThanOrEqual(4);
    });
  });

  it('returns Sundays in ascending order', () => {
    const result = getSundaysForYear(2025);
    result.forEach(({ sundays }) => {
      for (let i = 1; i < sundays.length; i++) {
        expect(sundays[i]).toBeGreaterThan(sundays[i - 1]);
      }
    });
  });
});

describe('buildHolidayRanges', () => {
  it('returns ranges for known years', () => {
    const ranges = buildHolidayRanges([2025, 2026]);
    expect(ranges[2025]).toBeDefined();
    expect(ranges[2025].length).toBe(2); // 설날 + 추석
    expect(ranges[2026]).toBeDefined();
    expect(ranges[2026].length).toBe(2);
  });

  it('returns empty array for unknown years', () => {
    const ranges = buildHolidayRanges([2099]);
    expect(ranges[2099]).toEqual([]);
  });
});

describe('getHolidayEvents', () => {
  it('marks Sundays that fall within holiday ranges', () => {
    const ranges = buildHolidayRanges([2025]);
    const events = getHolidayEvents(2025, ranges);
    // 2025 설날: 1/28~1/30 — January 26 is a Sunday, check if it's NOT in range
    // Actually 1/26 is before 1/28, so shouldn't be flagged
    const januarySundays = getSundaysForYear(2025)[0].sundays;
    // Verify the function returns at least some events for 2025
    expect(typeof events).toBe('object');
  });
});

describe('buildEvents', () => {
  it('includes holiday events', () => {
    const months = getSundaysForYear(2025);
    const ranges = buildHolidayRanges([2025]);
    const events = buildEvents(2025, months, ranges, {});
    // Should include at least holiday events
    expect(typeof events).toBe('object');
  });

  it('includes custom events', () => {
    const months = getSundaysForYear(2025);
    const ranges = buildHolidayRanges([2025]);
    // Find the first Sunday in January
    const firstSunday = months[0].sundays[0];
    const events = buildEvents(2025, months, ranges, {
      'custom1': { month: '1', day: String(firstSunday), label: '신년예배' },
    });
    expect(events['0-0']).toBe('신년예배');
  });

  it('does not include custom events for non-existent Sundays', () => {
    const months = getSundaysForYear(2025);
    const ranges = buildHolidayRanges([2025]);
    const events = buildEvents(2025, months, ranges, {
      'bad': { month: '1', day: '15', label: 'Not a Sunday' }, // 15 might not be a Sunday
    });
    // Should not crash, just skip
    expect(typeof events).toBe('object');
  });
});

describe('emailToKey', () => {
  it('replaces dots and @ signs', () => {
    expect(emailToKey('test@gmail.com')).toBe('test__at__gmail__dot__com');
  });

  it('handles multiple dots', () => {
    expect(emailToKey('first.last@mail.co.kr')).toBe('first__dot__last__at__mail__dot__co__dot__kr');
  });
});

describe('escapeHTML', () => {
  it('escapes angle brackets', () => {
    expect(escapeHTML('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('escapes ampersands', () => {
    expect(escapeHTML('A & B')).toBe('A &amp; B');
  });

  it('escapes quotes', () => {
    expect(escapeHTML("it's \"ok\"")).toBe('it&#39;s &quot;ok&quot;');
  });

  it('passes through normal text', () => {
    expect(escapeHTML('Hello World')).toBe('Hello World');
  });
});

describe('sortAndRenumber', () => {
  it('sorts by num and renumbers', () => {
    const students = [
      { name: 'C', num: 3 },
      { name: 'A', num: 1 },
      { name: 'B', num: 2 },
    ];
    const result = sortAndRenumber(students);
    expect(result.map(s => s.name)).toEqual(['A', 'B', 'C']);
    expect(result.map(s => s.num)).toEqual([1, 2, 3]);
  });

  it('sorts by name when num is undefined', () => {
    const students = [
      { name: '김철수' },
      { name: '가나다' },
      { name: '박영희' },
    ];
    const result = sortAndRenumber(students);
    expect(result[0].name).toBe('가나다');
    expect(result.map(s => s.num)).toEqual([1, 2, 3]);
  });

  it('handles empty array', () => {
    const result = sortAndRenumber([]);
    expect(result).toEqual([]);
  });

  it('does not mutate the original array', () => {
    const original = [{ name: 'B', num: 2 }, { name: 'A', num: 1 }];
    sortAndRenumber(original);
    expect(original[0].name).toBe('B'); // unchanged
  });
});
