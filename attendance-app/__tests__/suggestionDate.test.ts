import { describe, expect, it } from 'vitest';
import { formatSuggestionDate } from '@/utils/suggestionDate';

describe('건의사항 날짜 표시', () => {
  it.each([
    ['누락', undefined], ['null', null], ['빈 문자열', ''],
    ['숫자 문자열', '1788652800000'], ['날짜 문자열', '2026-09-06'],
    ['객체', {}], ['참·거짓', false], ['NaN', NaN],
    ['양의 무한대', Infinity], ['음의 무한대', -Infinity],
    ['최대 날짜 초과', 8_640_000_000_000_001], ['최소 날짜 미만', -8_640_000_000_000_001],
  ])('%s 값은 날짜 미상으로 보존하고 dateTime을 생략한다', (_, value) => {
    for (const detail of ['summary', 'detail'] as const) {
      expect(formatSuggestionDate(value, detail)).toEqual({ dateTime: undefined, label: '날짜 미상' });
    }
  });

  it('정상 날짜의 요약은 기존 한국어 월·일 표시와 ISO를 유지한다', () => {
    const value = Date.UTC(2026, 8, 6, 1, 25);
    const date = new Date(value);

    expect(formatSuggestionDate(value)).toEqual({
      dateTime: '2026-09-06T01:25:00.000Z',
      label: date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
    });
  });

  it('상세 날짜의 연도·시각도 기존 한국어 출력 형식을 유지한다', () => {
    const value = Date.UTC(2026, 8, 6, 1, 25);
    const date = new Date(value);

    expect(formatSuggestionDate(value, 'detail')).toEqual({
      dateTime: '2026-09-06T01:25:00.000Z',
      label: date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    });
  });

  it('유효한 0 타임스탬프를 누락으로 오인하지 않는다', () => {
    expect(formatSuggestionDate(0).dateTime).toBe('1970-01-01T00:00:00.000Z');
    expect(formatSuggestionDate(0).label).not.toBe('날짜 미상');
  });
});
