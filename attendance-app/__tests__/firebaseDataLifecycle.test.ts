import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState, isDataReady, reducer, type Action, type AppState } from '@/store/AppContext';
import { buildEvents, buildHolidayRanges, getSundaysForYear } from '@/utils/dates';

const database = vi.hoisted(() => ({ onValue: vi.fn(), get: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: {}, ref: (_db: unknown, path: string) => ({ path }),
  onValue: database.onValue, get: database.get,
}));
import { loadUserRole, subscribeFirebaseData } from '@/hooks/useFirebaseData';

type Snapshot = { exists: () => boolean; val: () => unknown };
type Subscription = { path: string; receive: (snapshot: Snapshot) => void; fail: (error: unknown) => void; unsubscribe: ReturnType<typeof vi.fn> };
let subscriptions: Subscription[];
const snapshot = (value: unknown): Snapshot => ({ exists: () => value !== null, val: () => value });

function loadedState(): AppState {
  const months = getSundaysForYear(2025);
  const holidayRanges = buildHolidayRanges([2025, 2026]);
  const customEventsData = { old: { month: '1', day: '4', label: '이전 연도 토요일 행사' } };
  return {
    ...structuredClone(initialState), fbReady: true,
    curYear: 2025, months, holidayRanges,
    userRole: { role: 'admin', email: 'old@example.invalid', _key: 'old' },
    allUserRoles: { old: { role: 'admin' } },
    classData: { '1-1-1': { students: [{ id: 'old', name: '이전 학생' }] } },
    attData: { '1-1-1': { old: { '0-0': 'O' } } },
    customEventsData, events: buildEvents(2025, months, holidayRanges, customEventsData),
    dataLoaded: { classes: true, attendance: true, events: true },
    attModal: { open: true, target: { ck: '1-1-1', sid: 'old', k: '0-0' } },
    studentModal: { open: true, editId: 'old' },
    moveModal: { open: true, target: { sid: 'old', fromCk: '1-1-1' } },
    historyModal: { open: true, sid: 'old', ck: '1-1-1' },
    rosterModal: true, addClassModal: true, saveStatus: 'saved',
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  subscriptions = [];
  database.onValue.mockImplementation((target: { path: string }, receive: Subscription['receive'], fail: Subscription['fail']) => {
    const unsubscribe = vi.fn();
    subscriptions.push({ path: target.path, receive, fail, unsubscribe });
    return unsubscribe;
  });
});

describe('원장 초기화와 구독 세대', () => {
  it.each([null, { role: 'teacher' as const, email: 'new@example.invalid', part: '2', grade: '3', class: '4' }])(
    '로그아웃·다른 계정 적용 시 원장과 기존 편집 대상을 즉시 비운다: %j', userRole => {
      const before = loadedState();
      const after = reducer(before, { type: 'SET_USER_ROLE', payload: userRole });
      expect(after).toMatchObject({
        userRole, classData: {}, attData: {}, customEventsData: {}, allUserRoles: {},
        dataLoaded: { classes: false, attendance: false, events: false },
        dataErrors: { classes: null, attendance: null, events: null },
        studentModal: { open: false, editId: null }, attModal: { open: false, target: null },
        moveModal: { open: false, target: null }, historyModal: { open: false, sid: null, ck: null },
        rosterModal: false, addClassModal: false, saveStatus: 'idle',
      });
      expect(after.dataRevision).toBe(before.dataRevision + 1);
      expect(isDataReady(after)).toBe(false);
      expect(before.classData['1-1-1'].students).toHaveLength(1);
    },
  );

  it('연도 전환은 이전 연도 행사를 새 달력에 적용하지 않는다', () => {
    const before = loadedState();
    const after = reducer(before, { type: 'SET_YEAR', payload: 2026 });
    expect(after.classData).toEqual({});
    expect(after.attData).toEqual({});
    expect(after.customEventsData).toEqual({});
    expect(after.events['0-0']).toBeUndefined();
    expect(after.events).toEqual(buildEvents(2026, after.months, after.holidayRanges, {}));
    expect(after.studentModal.open).toBe(false);
    expect(after.dataRevision).toBe(before.dataRevision + 1);
  });

  it('로그아웃·계정 전환 뒤 늦게 도착한 관리자 계정 목록은 비운 상태를 복원하지 않는다', () => {
    const before = loadedState();
    const delayedResponse: Action = {
      type: 'SET_ALL_USER_ROLES', revision: before.dataRevision,
      payload: { old: { role: 'admin', email: 'old@example.invalid' } },
    };
    const loggedOut = reducer(before, { type: 'SET_USER_ROLE', payload: null });
    expect(reducer(loggedOut, delayedResponse)).toBe(loggedOut);
    const nextAccount = reducer(loggedOut, {
      type: 'SET_USER_ROLE', payload: { role: 'admin', email: 'new@example.invalid' },
    });
    expect(reducer(nextAccount, delayedResponse)).toBe(nextAccount);
    expect(nextAccount.allUserRoles).toEqual({});
    const currentRoles = { current: { role: 'teacher' as const, email: 'current@example.invalid' } };
    expect(reducer(nextAccount, {
      type: 'SET_ALL_USER_ROLES', revision: nextAccount.dataRevision, payload: currentRoles,
    }).allUserRoles).toEqual(currentRoles);
  });

  it('연도 전환 뒤 cleanup 전 도착한 과거 성공·오류 응답도 새 상태를 덮지 않는다', () => {
    let state = loadedState();
    const stop = subscribeFirebaseData(state.curYear, null, state.dataRevision, action => { state = reducer(state, action); });
    state = reducer(state, { type: 'SET_YEAR', payload: 2026 });
    const expected = state;
    subscriptions[0].receive(snapshot({ '1-1-1': { students: { old: { name: '늦은 학생' } } } }));
    subscriptions[1].receive(snapshot({ '1-1-1': { old: { '0-0': 'O' } } }));
    subscriptions[2].fail({ code: 'PERMISSION_DENIED' });
    expect(state).toBe(expected);
    stop();
  });

  it('구독 종료 후 같은 세대의 성공·오류 콜백은 dispatch하지 않는다', () => {
    const dispatch = vi.fn();
    const stop = subscribeFirebaseData(2026, null, 0, dispatch);
    stop();
    subscriptions.forEach(subscription => {
      expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
      subscription.receive(snapshot({}));
      subscription.fail(new Error('늦은 오류'));
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('권한 취소는 기존 출석과 편집 대상을 비우고 명시 재조회 전에는 오류를 유지한다', () => {
    let state = loadedState();
    const stop = subscribeFirebaseData(state.curYear, null, state.dataRevision, action => { state = reducer(state, action); });
    subscriptions[1].fail({ code: 'PERMISSION_DENIED' });
    expect(state.attData).toEqual({});
    expect(state.dataErrors.attendance).toContain('볼 권한이 없습니다');
    expect(state.dataErrors.attendance).not.toContain('네트워크');
    expect(state.attModal.open).toBe(false);
    expect(isDataReady(state)).toBe(false);
    const failed = state;
    subscriptions[1].receive(snapshot({ '1-1-1': { old: { '0-0': 'O' } } }));
    expect(state).toBe(failed);
    expect(database.onValue).toHaveBeenCalledTimes(4);
    stop();

    state = reducer(state, { type: 'RETRY_DATA_LOAD' });
    expect(state.dataErrors.attendance).toBeNull();
    const stopRetry = subscribeFirebaseData(state.curYear, null, state.dataRevision, action => { state = reducer(state, action); });
    const retry = subscriptions.slice(4);
    retry[0].receive(snapshot(null));
    retry[1].receive(snapshot(null));
    expect(isDataReady(state)).toBe(false);
    retry[2].receive(snapshot(null));
    expect(isDataReady(state)).toBe(false);
    retry[3].receive(snapshot(null));
    expect(isDataReady(state)).toBe(true);
    expect(state.classData).toEqual({});
    expect(state.attData).toEqual({});
    stopRetry();
  });

  it('교사는 본인 반 명단·출석·체크 상태와 공용 행사만 구독하고 Firebase 학생 키를 보존한다', () => {
    let state = reducer(loadedState(), { type: 'SET_USER_ROLE', payload: { role: 'teacher', part: '2', grade: '3', class: '4' } });
    const stop = subscribeFirebaseData(2026, '2-3-4', state.dataRevision, action => { state = reducer(state, action); });
    expect(subscriptions.map(subscription => subscription.path)).toEqual(['classes/2026/2-3-4', 'attendance/2026/2-3-4', 'events/2026', 'attendanceChecks/2026/2-3-4']);
    subscriptions[0].receive(snapshot({ teacher: '담임', students: { original: { name: '학생', jang: true, personId: 'person_student_fixture' } } }));
    subscriptions[1].receive(snapshot({ original: { '0-0': 'T' } }));
    expect(state.attData).toEqual({});
    subscriptions[3].receive(snapshot(null));
    expect(state.classData['2-3-4'].students[0]).toMatchObject({ id: 'original', name: '학생', jang: true, personId: 'person_student_fixture' });
    expect(state.attData).toEqual({ '2-3-4': { original: { '0-0': 'O' } } });
    stop();
  });

  it.each([null, '1-1-1'])('옛 내부 id가 다른 학생 키와 겹쳐도 실제 원장 키로 두 학생을 구별한다: %s', teacherCk => {
    const dispatch = vi.fn();
    const stop = subscribeFirebaseData(2026, teacherCk, 0, dispatch);
    const info = { students: {
      actualA: { id: 'actualB', name: '합성 A', personId: 'person_A' },
      actualB: { id: 'actualB', name: '합성 B', personId: 'person_B' },
    } };
    subscriptions[0].receive(snapshot(teacherCk ? info : { '1-1-1': info }));
    expect(dispatch.mock.calls[0][0].payload['1-1-1'].students.map((student: { id: string }) => student.id)).toEqual(['actualA', 'actualB']);
    stop();
  });

  it('동기적인 구독 시작 실패도 오류 상태로 끝나고 나머지 구독을 계속 등록한다', () => {
    let state = loadedState();
    database.onValue.mockImplementationOnce(() => { throw new Error('조회 시작 실패'); });
    const stop = subscribeFirebaseData(2025, null, state.dataRevision, action => { state = reducer(state, action); });
    expect(state.dataErrors.classes).toContain('불러오지 못했습니다');
    expect(state.classData).toEqual({});
    expect(database.onValue).toHaveBeenCalledTimes(4);
    expect(subscriptions.map(subscription => subscription.path)).toEqual(['attendance/2025', 'events/2025', 'attendanceChecks/2025']);
    stop();
  });

  it('체크 상태 조회 실패는 출석 준비를 막고 다른 스트림 갱신으로 오류를 숨기지 않는다', () => {
    let state = loadedState();
    const stop = subscribeFirebaseData(2025, null, state.dataRevision, action => { state = reducer(state, action); });
    subscriptions[1].receive(snapshot({ '1-1-1': { old: { '0-0': 'O' } } }));
    subscriptions[3].receive(snapshot(null));
    subscriptions[3].fail({ code: 'PERMISSION_DENIED' });
    expect(state.attData).toEqual({});
    expect(state.attendanceChecks).toEqual({});
    expect(state.dataErrors.attendance).toContain('반별 체크 상태');
    const failed = state;
    subscriptions[1].receive(snapshot({ '1-1-1': { old: { '0-0': 'X' } } }));
    expect(state).toBe(failed);
    stop();
  });
});

describe('사용자 역할 조회 경쟁', () => {
  it('현재 계정의 일시적 조회 실패를 무권한으로 오인하지 않는다', async () => {
    database.get.mockRejectedValue(new Error('network unavailable'));
    const dispatch = vi.fn();
    expect(await loadUserRole({ uid: 'teacher', email: 'teacher@example.invalid' }, dispatch)).toBe('error');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('조회에 성공했지만 등록된 역할이 없으면 무권한으로 처리한다', async () => {
    database.get.mockResolvedValue(snapshot(null));
    expect(await loadUserRole({ uid: 'unknown', email: 'unknown@example.invalid' }, vi.fn())).toBe('unauthorized');
  });

  it('이전 계정의 지연된 성공은 최신 계정 역할과 반 선택을 덮지 않는다', async () => {
    const pending: ((snapshot: Snapshot) => void)[] = [];
    database.get.mockImplementation(() => new Promise(resolve => pending.push(resolve)));
    let state = loadedState();
    const dispatch = (action: Action) => { state = reducer(state, action); };
    let current = 'old';
    const older = loadUserRole({ uid: 'old', email: 'old@example.invalid' }, dispatch, () => current === 'old');
    current = 'new';
    const newer = loadUserRole({ uid: 'new', email: 'new@example.invalid' }, dispatch, () => current === 'new');
    pending[1](snapshot({ role: 'teacher', part: '2', grade: '3', class: '4' }));
    expect(await newer).toBe('ok');
    const accepted = state;
    pending[0](snapshot({ role: 'admin' }));
    expect(await older).toBe('stale');
    expect(state).toBe(accepted);
    expect(state).toMatchObject({ userRole: { role: 'teacher' }, curPart: '2', curGrade: '3', curClass: '4' });
  });

  it('종료된 조회의 실패는 현재 계정을 권한 없음으로 처리하지 않는다', async () => {
    let reject: (error: Error) => void = () => {};
    database.get.mockImplementation(() => new Promise((_resolve, rejectRequest) => { reject = rejectRequest; }));
    const dispatch = vi.fn();
    let active = true;
    const result = loadUserRole({ uid: 'old', email: 'old@example.invalid' }, dispatch, () => active);
    active = false;
    reject(new Error('지연된 권한 오류'));
    expect(await result).toBe('stale');
    expect(dispatch).not.toHaveBeenCalled();
  });
});
