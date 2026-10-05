'use client';
import React, { createContext, useContext, useReducer, useCallback } from 'react';
import type {
  UserRole, ClassDataMap, AttData, CustomEventData, EventsMap,
  MonthEntry, HolidayRanges, ViewKey, AttEditTarget, MoveTarget, AttValue,
} from '@/types';
import { getKSTYear, getSundaysForYear, getWindowYears, buildHolidayRanges, buildEvents } from '@/utils/dates';
import { normalizeAttendanceValue } from '@/utils/attendanceValue';

export type DataKey = 'classes' | 'attendance' | 'events';

// ─── State ────────────────────────────────────────────────────
export interface AppState {
  // 인증
  fbReady: boolean;
  userRole: UserRole | null;
  allUserRoles: Record<string, UserRole & { email?: string; name?: string }>;

  // 뷰/반 선택
  curView: ViewKey;
  curYear: number;
  curPart: string;
  curGrade: string;
  curClass: string;

  // Firebase 데이터
  classData: ClassDataMap;
  attData: AttData;
  customEventsData: CustomEventData;
  dataRevision: number;
  dataLoaded: Record<DataKey, boolean>;
  dataErrors: Record<DataKey, string | null>;

  // 날짜 계산
  months: MonthEntry[];
  holidayRanges: HolidayRanges;
  events: EventsMap;

  // 저장 상태
  saveStatus: 'idle' | 'saving' | 'saved' | 'error' | 'unknown';
  lastAttendanceSavedAt: number | null;

  // 모달 상태
  attModal: { open: boolean; target: AttEditTarget | null };
  studentModal: { open: boolean; editId: string | null };
  teacherModal: { open: boolean };
  accountModal: { open: boolean; editKey: string | null };
  rosterModal: boolean;
  moveModal: { open: boolean; target: MoveTarget | null };
  addClassModal: boolean;
  historyModal: { open: boolean; sid: string | null; ck: string | null };
}

const kstYear = getKSTYear();
const months = getSundaysForYear(kstYear);
const windowYears = getWindowYears(kstYear);
const holidayRanges = buildHolidayRanges(windowYears);

export const initialState: AppState = {
  fbReady: false,
  userRole: null,
  allUserRoles: {},

  curView: 'first',
  curYear: kstYear,
  curPart: '1',
  curGrade: '1',
  curClass: '1',

  classData: {},
  attData: {},
  customEventsData: {},
  dataRevision: 0,
  dataLoaded: { classes: false, attendance: false, events: false },
  dataErrors: { classes: null, attendance: null, events: null },

  months,
  holidayRanges,
  events: buildEvents(kstYear, months, holidayRanges, {}),

  saveStatus: 'idle',
  lastAttendanceSavedAt: null,

  attModal: { open: false, target: null },
  studentModal: { open: false, editId: null },
  teacherModal: { open: false },
  accountModal: { open: false, editKey: null },
  rosterModal: false,
  moveModal: { open: false, target: null },
  addClassModal: false,
  historyModal: { open: false, sid: null, ck: null },
};

// ─── Actions ──────────────────────────────────────────────────
type Action =
  | { type: 'SET_FB_READY' }
  | { type: 'SET_USER_ROLE'; payload: UserRole | null }
  | { type: 'SET_ALL_USER_ROLES'; revision: number; payload: Record<string, UserRole & { email?: string }> }
  | { type: 'SET_VIEW'; payload: ViewKey }
  | { type: 'SET_YEAR'; payload: number }
  | { type: 'CALENDAR_YEAR_CHANGED'; payload: { previousYear: number; currentYear: number } }
  | { type: 'SET_PART'; payload: string }
  | { type: 'SET_GRADE'; payload: string }
  | { type: 'SET_CLASS'; payload: string }
  | { type: 'SET_CLASS_DATA'; revision: number; payload: ClassDataMap }
  | { type: 'SET_ATT_DATA'; revision: number; payload: AttData }
  | { type: 'SET_CUSTOM_EVENTS'; revision: number; payload: CustomEventData }
  | { type: 'SET_DATA_ERROR'; revision: number; payload: { key: DataKey; message: string } }
  | { type: 'RETRY_DATA_LOAD' }
  | { type: 'SET_SAVE_STATUS'; payload: AppState['saveStatus']; savedAt?: number }
  | { type: 'OPEN_ATT_MODAL'; payload: AttEditTarget }
  | { type: 'CLOSE_ATT_MODAL' }
  | { type: 'OPEN_STUDENT_MODAL'; payload: { editId: string | null } }
  | { type: 'CLOSE_STUDENT_MODAL' }
  | { type: 'OPEN_TEACHER_MODAL' }
  | { type: 'CLOSE_TEACHER_MODAL' }
  | { type: 'OPEN_ACCOUNT_MODAL'; payload: { editKey: string | null } }
  | { type: 'CLOSE_ACCOUNT_MODAL' }
  | { type: 'OPEN_ROSTER_MODAL' }
  | { type: 'CLOSE_ROSTER_MODAL' }
  | { type: 'OPEN_MOVE_MODAL'; payload: MoveTarget }
  | { type: 'CLOSE_MOVE_MODAL' }
  | { type: 'OPEN_ADD_CLASS_MODAL' }
  | { type: 'CLOSE_ADD_CLASS_MODAL' }
  | { type: 'OPEN_HISTORY_MODAL'; payload: { sid: string; ck: string } }
  | { type: 'CLOSE_HISTORY_MODAL' };

function closeModals(): Pick<AppState, 'attModal' | 'studentModal' | 'teacherModal' | 'accountModal' | 'rosterModal' | 'moveModal' | 'addClassModal' | 'historyModal'> {
  return {
    attModal: { open: false, target: null },
    studentModal: { open: false, editId: null },
    teacherModal: { open: false },
    accountModal: { open: false, editKey: null },
    rosterModal: false,
    moveModal: { open: false, target: null },
    addClassModal: false,
    historyModal: { open: false, sid: null, ck: null },
  };
}

// 이전 계정·연도·재조회 세대의 원장과 편집 대상을 함께 비운다. 운영 DB는 변경하지 않는다.
function resetData(state: AppState): AppState {
  return {
    ...state,
    ...closeModals(),
    classData: {}, attData: {}, customEventsData: {}, allUserRoles: {},
    events: buildEvents(state.curYear, state.months, state.holidayRanges, {}),
    dataRevision: state.dataRevision + 1,
    dataLoaded: { classes: false, attendance: false, events: false },
    dataErrors: { classes: null, attendance: null, events: null },
    saveStatus: 'idle',
    lastAttendanceSavedAt: null,
  };
}

export function reducer(state: AppState, action: Action): AppState {
  if ('revision' in action && (action.revision !== state.dataRevision || !state.userRole)) return state;
  switch (action.type) {
    case 'SET_FB_READY':
      return { ...state, fbReady: true };
    case 'SET_USER_ROLE':
      return resetData({ ...state, userRole: action.payload });
    case 'SET_ALL_USER_ROLES':
      return { ...state, allUserRoles: action.payload };
    case 'SET_VIEW':
      return { ...state, curView: action.payload };
    case 'CALENDAR_YEAR_CHANGED':
      return action.payload.previousYear !== action.payload.currentYear && state.curYear === action.payload.previousYear
        ? reducer(state, { type: 'SET_YEAR', payload: action.payload.currentYear }) : state;
    case 'SET_YEAR': {
      const newYear = action.payload;
      const newMonths = getSundaysForYear(newYear);
      const newWindow = getWindowYears(newYear);
      const newRanges = buildHolidayRanges(newWindow);
      return resetData({
        ...state,
        curYear: newYear,
        months: newMonths,
        holidayRanges: newRanges,
      });
    }
    case 'SET_PART':
      return { ...state, curPart: action.payload };
    case 'SET_GRADE':
      return { ...state, curGrade: action.payload };
    case 'SET_CLASS':
      return { ...state, curClass: action.payload };
    case 'SET_CLASS_DATA':
      return { ...state, classData: action.payload, dataLoaded: { ...state.dataLoaded, classes: true }, dataErrors: { ...state.dataErrors, classes: null } };
    case 'SET_ATT_DATA':
      return { ...state, attData: action.payload, dataLoaded: { ...state.dataLoaded, attendance: true }, dataErrors: { ...state.dataErrors, attendance: null } };
    case 'SET_CUSTOM_EVENTS': {
      const newEvents = buildEvents(state.curYear, state.months, state.holidayRanges, action.payload);
      return { ...state, customEventsData: action.payload, events: newEvents, dataLoaded: { ...state.dataLoaded, events: true }, dataErrors: { ...state.dataErrors, events: null } };
    }
    case 'SET_DATA_ERROR': {
      const { key, message } = action.payload;
      const cleared = key === 'classes' ? { classData: {} } : key === 'attendance' ? { attData: {} } : {
        customEventsData: {}, events: buildEvents(state.curYear, state.months, state.holidayRanges, {}),
      };
      return {
        ...state, ...closeModals(), ...cleared,
        dataLoaded: { ...state.dataLoaded, [key]: false },
        dataErrors: { ...state.dataErrors, [key]: message },
      };
    }
    case 'RETRY_DATA_LOAD':
      return resetData(state);
    case 'SET_SAVE_STATUS':
      return { ...state, saveStatus: action.payload,
        lastAttendanceSavedAt: action.payload === 'saved' && action.savedAt !== undefined
          ? action.savedAt : state.lastAttendanceSavedAt };
    case 'OPEN_ATT_MODAL':
      return { ...state, attModal: { open: true, target: action.payload } };
    case 'CLOSE_ATT_MODAL':
      return { ...state, attModal: { open: false, target: null } };
    case 'OPEN_STUDENT_MODAL':
      return { ...state, studentModal: { open: true, editId: action.payload.editId } };
    case 'CLOSE_STUDENT_MODAL':
      return { ...state, studentModal: { open: false, editId: null } };
    case 'OPEN_TEACHER_MODAL':
      return { ...state, teacherModal: { open: true } };
    case 'CLOSE_TEACHER_MODAL':
      return { ...state, teacherModal: { open: false } };
    case 'OPEN_ACCOUNT_MODAL':
      return { ...state, accountModal: { open: true, editKey: action.payload.editKey } };
    case 'CLOSE_ACCOUNT_MODAL':
      return { ...state, accountModal: { open: false, editKey: null } };
    case 'OPEN_ROSTER_MODAL':
      return { ...state, rosterModal: true };
    case 'CLOSE_ROSTER_MODAL':
      return { ...state, rosterModal: false };
    case 'OPEN_MOVE_MODAL':
      return { ...state, moveModal: { open: true, target: action.payload } };
    case 'CLOSE_MOVE_MODAL':
      return { ...state, moveModal: { open: false, target: null } };
    case 'OPEN_ADD_CLASS_MODAL':
      return { ...state, addClassModal: true };
    case 'CLOSE_ADD_CLASS_MODAL':
      return { ...state, addClassModal: false };
    case 'OPEN_HISTORY_MODAL':
      return { ...state, historyModal: { open: true, sid: action.payload.sid, ck: action.payload.ck } };
    case 'CLOSE_HISTORY_MODAL':
      return { ...state, historyModal: { open: false, sid: null, ck: null } };
    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────
const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
} | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export function isDataReady(state: AppState): boolean {
  return !!state.userRole && state.dataLoaded.classes && state.dataLoaded.attendance && state.dataLoaded.events
    && !Object.values(state.dataErrors).some(Boolean);
}

// ─── 편의 셀렉터 ──────────────────────────────────────────────
export function useClassKey(state: AppState): string {
  return `${state.curPart}-${state.curGrade}-${state.curClass}`;
}

export function useClassKeys(state: AppState): string[] {
  const keys = Object.keys(state.classData).filter(ck => {
    const [p, g] = ck.split('-');
    return p === state.curPart && g === state.curGrade;
  }).sort((a, b) => {
    const ca = parseInt(a.split('-')[2]);
    const cb = parseInt(b.split('-')[2]);
    return ca - cb;
  });
  // 선생님 계정은 본인 반만 표시
  if (state.userRole?.role === 'teacher' && state.userRole.class) {
    return keys.filter(k => k.split('-')[2] === state.userRole!.class);
  }
  return keys;
}

export function useCurrentStudents(state: AppState) {
  const ck = `${state.curPart}-${state.curGrade}-${state.curClass}`;
  return state.classData[ck]?.students ?? [];
}

export function useAttVal(
  state: AppState, ck: string, sid: string, k: string
): AttValue {
  return normalizeAttendanceValue(state.attData[ck]?.[sid]?.[k]);
}

// ─── 출석 통계 계산 ───────────────────────────────────────────
export function calcStats(state: Pick<AppState, 'months' | 'curView' | 'attData' | 'events'>, ck: string, sid: string) {
  const { months, curView, attData, events } = state;
  let total = 0, present = 0, absent = 0;

  months.forEach(({ sundays }, mi) => {
    sundays.forEach((_, di) => {
      const k = `${mi}-${di}`;
      if (events[k]) return; // 연휴/이벤트 제외

      const monthNum = months[mi].month;
      const inFirst = monthNum >= 1 && monthNum <= 6;
      const inSecond = monthNum >= 7 && monthNum <= 12;
      if (curView === 'first' && !inFirst) return;
      if (curView === 'second' && !inSecond) return;

      total++;
      const v = normalizeAttendanceValue(attData[ck]?.[sid]?.[k]);
      if (v === 'O') present++;
      else if (v === 'X') absent++;
    });
  });

  const recorded = present + absent;
  const rate = recorded > 0 ? Math.round((present / recorded) * 100) : 0;
  return { total, present, absent, rate };
}

export type { Action };
export { useCallback };
