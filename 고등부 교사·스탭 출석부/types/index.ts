// ─── 그룹 키 (1부교사 / 2부교사 / 스탭) ──────────────────────
export type GroupKey = 'part1' | 'part2' | 'staff';

export const GROUP_LABELS: Record<GroupKey, string> = {
  part1: '1부 교사',
  part2: '2부 교사',
  staff: '스탭',
};

export const GROUP_KEYS: GroupKey[] = ['part1', 'part2', 'staff'];

// ─── 스탭 사역팀 ──────────────────────────────────────────────
export const STAFF_TEAMS = ['바나바팀', '찬양팀', '미디어팀', '예배팀', '기획디자인팀', '행정팀'] as const;
export type StaffTeam = typeof STAFF_TEAMS[number];

// ─── 사용자 역할 ───────────────────────────────────────────────
export type UserRole = {
  role: 'admin' | 'user';
  name?: string;
  email?: string;
  _key?: string;
};

// ─── 멤버 ──────────────────────────────────────────────────────
export type Member = {
  id: string;
  name: string;
  num?: number;
  phone?: string;
};

// ─── 그룹 데이터 ──────────────────────────────────────────────
export type GroupData = {
  members: Member[];
};

export type GroupDataMap = Record<GroupKey | StaffTeam | string, GroupData>;

// ─── 출석 값 ──────────────────────────────────────────────────
export type AttValue = 'O' | 'X' | 'T' | '';

export type AttData = {
  [groupKey: string]: {
    [memberId: string]: {
      [cellKey: string]: AttValue;
    };
  };
};

// ─── 연휴 범위 ────────────────────────────────────────────────
export type HolidayRange = {
  start: [number, number];
  end: [number, number];
  label: string;
};

export type HolidayRanges = Record<number, HolidayRange[]>;

// ─── 월별 주일 목록 ───────────────────────────────────────────
export type MonthEntry = {
  month: number;
  sundays: number[];
};

// ─── 커스텀 이벤트 ────────────────────────────────────────────
export type CustomEventData = {
  [key: string]: {
    month: string;
    day: string;
    label: string;
  };
};

export type EventsMap = Record<string, string>; // 'mi-di' -> label

// ─── 탭 ───────────────────────────────────────────────────────
export type TabKey = 'att' | 'stat' | 'admin';

// ─── 출석 모달 타겟 ───────────────────────────────────────────
export type AttEditTarget = {
  gk: GroupKey;
  mid: string;
  k: string;
};
