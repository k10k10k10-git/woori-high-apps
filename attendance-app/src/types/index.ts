// ─── 사용자 역할 ───────────────────────────────────────────────
export type UserRole = {
  role: 'admin' | 'teacher';
  part?: string;
  grade?: string;
  class?: string;
  name?: string;
  email?: string;
  _key?: string;
};

// ─── 학생 ──────────────────────────────────────────────────────
export type Student = {
  id: string;
  personId?: string;
  name: string;
  num?: number;
  birth?: string;
  phone?: string;
  pphone?: string;
  school?: string;
  addr?: string;
  photo?: string;
  jang?: boolean; // 장결자(장기결석) — 시트 "장결자 명단" 구역에서 동기화됨
};

// ─── 반 데이터 ────────────────────────────────────────────────
export type ClassInfo = {
  teacher?: string;
  teacherPhoto?: string;
  students: Student[];
};

export type ClassDataMap = Record<string, ClassInfo>;

// ─── 출석 값 ──────────────────────────────────────────────────
export type AttValue = 'O' | 'X' | '';

export type AttData = {
  [classKey: string]: {
    [studentId: string]: {
      [cellKey: string]: AttValue;
    };
  };
};

// ─── 연휴 범위 ────────────────────────────────────────────────
export type HolidayRange = {
  start: [number, number]; // [month, day]
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

export type EventsMap = Record<string, string>; // 'month-day' -> label

// ─── 탭 ───────────────────────────────────────────────────────
export type TabKey = 'att' | 'stat' | 'manage' | 'overall' | 'admin';

// ─── 뷰 (1부/2부/전체) ────────────────────────────────────────
export type ViewKey = 'first' | 'second' | 'all';

// ─── 교사 데이터 (전체 탭) ────────────────────────────────────
export type TeacherEntry = {
  type?: 'leader' | 'teacher';
  grade?: string;
  name?: string;
  gender?: string;
  phone?: string;
};

// ─── 출석 모달 타겟 ───────────────────────────────────────────
export type AttEditTarget = {
  ck: string;
  sid: string;
  k: string;
};

// ─── 학생 이동 ────────────────────────────────────────────────
export type MoveTarget = {
  sid: string;
  fromCk: string;
};
