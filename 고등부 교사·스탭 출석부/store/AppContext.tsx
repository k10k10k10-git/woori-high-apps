'use client';

import React, { createContext, useContext, useReducer } from 'react';
import type {
  UserRole, GroupDataMap, AttData, CustomEventData, EventsMap,
  MonthEntry, HolidayRanges, TabKey, GroupKey, AttEditTarget, Member, StaffTeam,
} from '@/types';
import { GROUP_KEYS, STAFF_TEAMS } from '@/types';
import { getKSTYear, getSundaysForYear, getWindowYears, buildHolidayRanges, buildEvents } from '@/utils/dates';

// ─── State ────────────────────────────────────────────────────
export interface AppState {
  fbReady: boolean;
  userRole: UserRole | null;
  allUserRoles: Record<string, UserRole & { email?: string }>;

  curTab: TabKey;
  curGroup: GroupKey;
  curStaffTeam: StaffTeam;
  curYear: number;

  groupData: GroupDataMap;
  attData: AttData;
  customEventsData: CustomEventData;

  months: MonthEntry[];
  holidayRanges: HolidayRanges;
  events: EventsMap;

  saveStatus: 'idle' | 'saving' | 'saved';

  attModal: { open: boolean; target: AttEditTarget | null };
  memberModal: { open: boolean; editId: string | null };
  accountModal: { open: boolean; editKey: string | null };
}

const kstYear = getKSTYear();
const months = getSundaysForYear(kstYear);
const windowYears = getWindowYears(kstYear);
const holidayRanges = buildHolidayRanges(windowYears);

const emptyGroupData: GroupDataMap = {
  part1: { members: [] },
  part2: { members: [] },
  staff: { members: [] },
};

const initialState: AppState = {
  fbReady: false,
  userRole: null,
  allUserRoles: {},

  curTab: 'att',
  curGroup: 'part1',
  curStaffTeam: STAFF_TEAMS[0],
  curYear: kstYear,

  groupData: emptyGroupData,
  attData: {},
  customEventsData: {},

  months,
  holidayRanges,
  events: buildEvents(kstYear, months, holidayRanges, {}),

  saveStatus: 'idle',

  attModal: { open: false, target: null },
  memberModal: { open: false, editId: null },
  accountModal: { open: false, editKey: null },
};

// ─── Actions ──────────────────────────────────────────────────
type Action =
  | { type: 'SET_FB_READY' }
  | { type: 'SET_USER_ROLE'; payload: UserRole | null }
  | { type: 'SET_ALL_USER_ROLES'; payload: Record<string, UserRole & { email?: string }> }
  | { type: 'SET_TAB'; payload: TabKey }
  | { type: 'SET_GROUP'; payload: GroupKey }
  | { type: 'SET_STAFF_TEAM'; payload: StaffTeam }
  | { type: 'SET_YEAR'; payload: number }
  | { type: 'SET_GROUP_DATA'; payload: GroupDataMap }
  | { type: 'SET_PART_TEACHERS'; payload: { part1: Member[]; part2: Member[] } }
  | { type: 'SET_STAFF_TEAM_MEMBERS'; payload: { team: StaffTeam; members: Member[] } }
  | { type: 'SET_ATT_DATA'; payload: AttData }
  | { type: 'SET_CUSTOM_EVENTS'; payload: CustomEventData }
  | { type: 'SET_SAVE_STATUS'; payload: AppState['saveStatus'] }
  | { type: 'OPEN_ATT_MODAL'; payload: AttEditTarget }
  | { type: 'CLOSE_ATT_MODAL' }
  | { type: 'OPEN_MEMBER_MODAL'; payload: { editId: string | null } }
  | { type: 'CLOSE_MEMBER_MODAL' }
  | { type: 'OPEN_ACCOUNT_MODAL'; payload: { editKey: string | null } }
  | { type: 'CLOSE_ACCOUNT_MODAL' };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_FB_READY':
      return { ...state, fbReady: true };
    case 'SET_USER_ROLE':
      return { ...state, userRole: action.payload };
    case 'SET_ALL_USER_ROLES':
      return { ...state, allUserRoles: action.payload };
    case 'SET_TAB':
      return { ...state, curTab: action.payload };
    case 'SET_GROUP':
      return { ...state, curGroup: action.payload };
    case 'SET_STAFF_TEAM':
      return { ...state, curStaffTeam: action.payload };
    case 'SET_YEAR': {
      const newYear = action.payload;
      const newMonths = getSundaysForYear(newYear);
      const newWindow = getWindowYears(newYear);
      const newRanges = buildHolidayRanges(newWindow);
      return {
        ...state,
        curYear: newYear,
        months: newMonths,
        holidayRanges: newRanges,
        events: buildEvents(newYear, newMonths, newRanges, state.customEventsData),
        groupData: emptyGroupData,
        attData: {},
        customEventsData: {},
      };
    }
    case 'SET_GROUP_DATA':
      return { ...state, groupData: action.payload };
    case 'SET_PART_TEACHERS':
      return {
        ...state,
        groupData: {
          ...state.groupData,
          part1: { members: action.payload.part1 },
          part2: { members: action.payload.part2 },
        },
      };
    case 'SET_STAFF_TEAM_MEMBERS':
      return {
        ...state,
        groupData: {
          ...state.groupData,
          [action.payload.team]: { members: action.payload.members },
        },
      };
    case 'SET_ATT_DATA':
      return { ...state, attData: action.payload };
    case 'SET_CUSTOM_EVENTS': {
      const newEvents = buildEvents(state.curYear, state.months, state.holidayRanges, action.payload);
      return { ...state, customEventsData: action.payload, events: newEvents };
    }
    case 'SET_SAVE_STATUS':
      return { ...state, saveStatus: action.payload };
    case 'OPEN_ATT_MODAL':
      return { ...state, attModal: { open: true, target: action.payload } };
    case 'CLOSE_ATT_MODAL':
      return { ...state, attModal: { open: false, target: null } };
    case 'OPEN_MEMBER_MODAL':
      return { ...state, memberModal: { open: true, editId: action.payload.editId } };
    case 'CLOSE_MEMBER_MODAL':
      return { ...state, memberModal: { open: false, editId: null } };
    case 'OPEN_ACCOUNT_MODAL':
      return { ...state, accountModal: { open: true, editKey: action.payload.editKey } };
    case 'CLOSE_ACCOUNT_MODAL':
      return { ...state, accountModal: { open: false, editKey: null } };
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

// ─── 출석 통계 계산 ───────────────────────────────────────────
export function calcStats(state: AppState, gk: string, mid: string) {
  const { months, attData, events } = state;
  let total = 0, present = 0, absent = 0, tardy = 0;

  months.forEach(({ sundays }, mi) => {
    sundays.forEach((_, di) => {
      const k = `${mi}-${di}`;
      if (events[k]) return;
      total++;
      const v = attData[gk]?.[mid]?.[k] ?? '';
      if (v === 'O') present++;
      else if (v === 'X') absent++;
      else if (v === 'T') tardy++;
    });
  });

  const rate = total > 0 ? Math.round((present / total) * 100) : 0;
  return { total, present, absent, tardy, rate };
}

// 현재 실제로 사용되는 그룹 키 (스탭이면 팀명, 아니면 그룹키)
export function effectiveKey(state: AppState): string {
  return state.curGroup === 'staff' ? state.curStaffTeam : state.curGroup;
}

export { GROUP_KEYS, STAFF_TEAMS };
export type { Action };
