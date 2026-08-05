import { IguardScheduleBlock, Retreat, RetreatPeriod } from "./types";

/** 현장 시간·수련회 일차 판정 순수 로직 — ExecutionViews에서 추출 (2026-07 리팩토링 I2).
 *  24시+ 표기(24:30~25:30) 처리 등 사고 이력이 있는 로직 — 수정 시 __tests__/scheduleTime.test.ts 필수 통과. */

export function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function diffDays(fromYMD: string, toYMD: string): number {
  const a = fromYMD.match(/^(\d{4})-(\d{2})-(\d{2})$/), b = toYMD.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!a || !b) return NaN;
  return Math.round((Date.UTC(+b[1], +b[2] - 1, +b[3]) - Date.UTC(+a[1], +a[2] - 1, +a[3])) / 86400000);
}
export function addDays(ymd: string, days: number): string | null {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + days));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
export function formatShortDate(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[2])}/${Number(m[3])}` : ymd;
}
export function normalizeText(value?: string): string {
  return (value || "").toLowerCase().replace(/[\s_~\-·()[\]{}.,!?:/\\|'"“”‘’]+/g, "");
}
export function periodMatchesRetreat(p: RetreatPeriod, retreat?: Retreat): boolean {
  const retreatName = normalizeText(retreat?.name);
  if (!retreatName) return false;
  return [p.theme, p.label]
    .map(normalizeText)
    .filter(text => text.length >= 3)
    .some(text => retreatName.includes(text) || text.includes(retreatName));
}
export function activePeriod(periods?: RetreatPeriod[], retreat?: Retreat): RetreatPeriod | null {
  const today = todayStr();
  const sorted = [...(periods || [])].filter(p => p.startDate && p.endDate).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const matched = sorted.filter(p => periodMatchesRetreat(p, retreat));
  if (matched.length) {
    return matched.find(p => p.startDate <= today && today <= p.endDate) ?? matched[0];
  }
  if (retreat?.startDate && retreat?.endDate) {
    return {
      id: "__retreat_period",
      startDate: retreat.startDate,
      endDate: retreat.endDate,
      label: retreat.name,
    };
  }
  return sorted.find(p => p.startDate <= today && today <= p.endDate) ?? sorted[0] ?? null;
}
export function retreatDateForDay(periods: RetreatPeriod[] | undefined, retreat: Retreat | undefined, day: number): string | null {
  const p = activePeriod(periods, retreat);
  if (!p) return null;
  const date = addDays(p.startDate, day - 1);
  return date && date <= p.endDate ? date : null;
}
export function periodRangeLabel(periods?: RetreatPeriod[], retreat?: Retreat): string {
  const p = activePeriod(periods, retreat);
  if (!p) return "수련회 기간 미설정";
  return `${formatShortDate(p.startDate)}~${formatShortDate(p.endDate)}`;
}
/** 오늘이 수련회 며칠차인지(1부터). 오늘을 포함하는 기간이 없으면 null */
export function currentRetreatDay(periods?: RetreatPeriod[], retreat?: Retreat): number | null {
  const primary = activePeriod(periods, retreat);
  const today = todayStr();
  if (primary && primary.startDate <= today && today <= primary.endDate) {
    const diff = diffDays(primary.startDate, today);
    if (!isNaN(diff) && diff >= 0) return diff + 1;
  }
  return null;
}
export function isOpenEndedBlock(b: IguardScheduleBlock): boolean {
  return b.end === "~";
}
export function toMinutes(value?: string): number | null {
  if (!value || value === "~") return null;
  const match = value.match(/^([0-2]?\d|3[0-5]):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}
export function compareBlocks(a: IguardScheduleBlock, b: IguardScheduleBlock): number {
  return a.day - b.day || (toMinutes(a.start) ?? 0) - (toMinutes(b.start) ?? 0);
}
/** 그 블록이 "지금"인가 — 시간대 일치 + (현재 일자를 알면) 일자도 일치.
 *  큐싯의 24시+ 표기(예: 24:30~25:30 샐브)는 달력상 다음날 새벽이므로,
 *  전날 블록 중 자정을 넘겨 끝나는 닫힌 블록은 오늘 새벽 시각(now+24h)과 비교한다. */
export function isNowOn(b: IguardScheduleBlock, curDay: number | null, currentTime = nowHHMM()): boolean {
  if (!b.end) return false;
  if (curDay == null) return false;
  const start = toMinutes(b.start);
  const now = toMinutes(currentTime);
  if (start == null || now == null) return false;
  if (b.day === curDay) {
    if (isOpenEndedBlock(b)) return start <= now;
    const end = toMinutes(b.end);
    return end != null && start <= now && now < end;
  }
  if (b.day === curDay - 1 && !isOpenEndedBlock(b)) {
    const end = toMinutes(b.end);
    const lateNow = now + 24 * 60;
    return end != null && end > 24 * 60 && start <= lateNow && lateNow < end;
  }
  return false;
}
export function currentBlockFor(schedule: IguardScheduleBlock[], curDay: number | null, currentTime = nowHHMM()): IguardScheduleBlock | null {
  if (curDay == null) return null;
  const todayBlocks = schedule.filter(b => b.day === curDay).sort(compareBlocks);
  // 전날의 새벽(24시+) 블록도 후보에 포함 — 예: 2일차 24:30~25:30은 3일차 00:30에 "지금"
  const candidates = schedule.filter(b => b.day === curDay || b.day === curDay - 1).sort(compareBlocks);
  const current = candidates.find(b => isNowOn(b, curDay, currentTime));
  if (current) return current;
  const firstToday = todayBlocks[0];
  const previousOpen = schedule
    .filter(b => b.day === curDay - 1 && isOpenEndedBlock(b))
    .sort((a, b) => (toMinutes(b.start) ?? 0) - (toMinutes(a.start) ?? 0))[0] ?? null;
  const now = toMinutes(currentTime) ?? 0;
  const firstStart = toMinutes(firstToday?.start);
  if (previousOpen && (firstStart == null || now < firstStart)) return previousOpen;
  return null;
}
export function nextBlockFor(blocks: IguardScheduleBlock[], currentTime: string): IguardScheduleBlock | null {
  const now = toMinutes(currentTime) ?? 0;
  return blocks.find(b => (toMinutes(b.start) ?? 0) > now) ?? null;
}
export function timeRangeLabel(b: IguardScheduleBlock): string {
  if (!b.end) return b.start;
  return isOpenEndedBlock(b) ? `${b.start}~` : `${b.start}~${b.end}`;
}
