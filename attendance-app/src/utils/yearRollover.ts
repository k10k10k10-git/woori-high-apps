import { getKSTYear } from './dates';

/** 화면의 조회 연도가 아니라 실제 달력 연도 변경만 알린다. */
export function watchCalendarYear(onChange: (previousYear: number, currentYear: number) => void) {
  let observedYear = getKSTYear();
  let active = true;
  let timer: ReturnType<typeof setTimeout>;

  const check = () => {
    if (!active) return;
    const currentYear = getKSTYear();
    if (currentYear === observedYear) return;
    const previousYear = observedYear;
    observedYear = currentYear;
    onChange(previousYear, currentYear);
  };
  const schedule = () => {
    const nowKST = new Date(Date.now() + 9 * 3600 * 1000);
    const msUntil =
      ((23 - nowKST.getUTCHours()) * 3600 + (59 - nowKST.getUTCMinutes()) * 60 + (60 - nowKST.getUTCSeconds())) * 1000 + 1000;
    timer = setTimeout(() => {
      if (!active) return;
      check();
      schedule();
    }, msUntil);
  };
  schedule();

  return {
    check,
    stop() { active = false; clearTimeout(timer); },
  };
}
