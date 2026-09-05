type DateDetail = 'summary' | 'detail';

/** 잘못된 저장 날짜 한 건이 건의사항 전체 렌더를 중단하지 않게 한다. */
export function formatSuggestionDate(createdAt: unknown, detail: DateDetail = 'summary'): { dateTime: string | undefined; label: string } {
  const date = typeof createdAt === 'number' && Number.isFinite(createdAt) ? new Date(createdAt) : null;
  if (!date || !Number.isFinite(date.getTime())) return { dateTime: undefined, label: '날짜 미상' };

  return {
    dateTime: date.toISOString(),
    label: date.toLocaleDateString('ko-KR', detail === 'summary'
      ? { month: 'short', day: 'numeric' }
      : { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
  };
}
