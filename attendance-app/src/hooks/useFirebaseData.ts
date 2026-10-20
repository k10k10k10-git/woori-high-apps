'use client';
import { useEffect } from 'react';
import { db, ref, onValue, get } from '@/lib/db';
import { useApp, type Action, type DataKey } from '@/store/AppContext';
import { sortAndRenumber, emailToKey } from '@/utils/dates';
import { dataLoadMessage } from '@/utils/dbError';
import { normalizeAttendanceData } from '@/utils/attendanceValue';
import { normalizeAttendanceChecks, attendanceChecksPath } from '@/utils/attendanceChecks';
import type { ClassDataMap, CustomEventData, UserRole, Student } from '@/types';

type FbClass = {
  teacher?: string;
  teacherPhoto?: string;
  students?: Record<string, { name: string; num?: number; [k: string]: unknown }>;
};

// Firebase 반 노드 → 앱 ClassInfo 변환 (Firebase key를 id로 주입, 번호 재계산)
function toClassInfo(fc: FbClass): ClassDataMap[string] {
  return {
    teacher: fc.teacher ?? '',
    teacherPhoto: fc.teacherPhoto ?? '',
    students: fc.students
      ? sortAndRenumber(Object.entries(fc.students).map(([id, s]) => ({ ...s as object, id })) as Student[])
      : [],
  };
}

// 한 구독 세대의 종료·실패 이후 응답은 적용하지 않는다. 재시도는 화면의 명시 버튼으로만 한다.
export function subscribeFirebaseData(
  curYear: number,
  teacherCk: string | null,
  revision: number,
  dispatch: (action: Action) => void,
): () => void {
  let active = true;
  let attendanceFailed = false;
  const unsubs: (() => void)[] = [];
  const subscribe = (
    key: DataKey,
    path: string,
    label: string,
    onData: (value: unknown) => Action | null,
  ) => {
    let failed = false;
    const fail = (error: unknown) => {
      if (!active || failed) return;
      failed = true;
      if (key === 'attendance') attendanceFailed = true;
      dispatch({ type: 'SET_DATA_ERROR', revision, payload: { key, message: dataLoadMessage(label, error) } });
    };
    try {
      unsubs.push(onValue(ref(db, path), snap => {
        if (!active || failed) return;
        try { const action = onData(snap.exists() ? snap.val() : null); if (action) dispatch(action); }
        catch (error) { fail(error); }
      }, fail));
    } catch (error) { fail(error); }
  };

  const classPath = teacherCk ? `classes/${curYear}/${teacherCk}` : `classes/${curYear}`;
  const attendancePath = teacherCk ? `attendance/${curYear}/${teacherCk}` : `attendance/${curYear}`;
  subscribe('classes', classPath, '학생/반', value => {
    const payload: ClassDataMap = {};
    if (value) {
      if (teacherCk) payload[teacherCk] = toClassInfo(value as FbClass);
      else Object.entries(value as Record<string, FbClass>).forEach(([ck, info]) => { payload[ck] = toClassInfo(info); });
    }
    return { type: 'SET_CLASS_DATA', revision, payload };
  });
  let attendance: unknown, checks: unknown;
  let hasAttendance = false, hasChecks = false;
  const attendanceAction = (): Action | null => !attendanceFailed && hasAttendance && hasChecks ? {
    type: 'SET_ATT_DATA', revision,
    payload: attendance ? normalizeAttendanceData(teacherCk ? { [teacherCk]: attendance } : attendance) : {},
    checks: normalizeAttendanceChecks(teacherCk ? { [teacherCk]: checks ?? {} } : checks),
  } : null;
  subscribe('attendance', attendancePath, '출석', value => { attendance = value; hasAttendance = true; return attendanceAction(); });
  subscribe('events', `events/${curYear}`, '이벤트', value => ({
    type: 'SET_CUSTOM_EVENTS', revision, payload: (value ?? {}) as CustomEventData,
  }));
  subscribe('attendance', attendanceChecksPath(curYear, teacherCk ?? undefined), '반별 체크 상태', value => {
    checks = value; hasChecks = true; return attendanceAction();
  });

  return () => {
    active = false;
    unsubs.forEach(unsubscribe => unsubscribe());
  };
}

// 교사는 본인 반만, 관리자는 기존 연도 범위 전체를 구독한다.
export function useFirebaseData() {
  const { state, dispatch } = useApp();
  const { curYear, fbReady, userRole, dataRevision } = state;
  const role = userRole?.role;
  const teacherCk = role === 'teacher'
    ? `${userRole!.part ?? '1'}-${userRole!.grade ?? '1'}-${userRole!.class ?? '1'}`
    : null;

  useEffect(() => {
    if (!fbReady || !role) return;
    return subscribeFirebaseData(curYear, teacherCk, dataRevision, dispatch);
  }, [fbReady, curYear, role, teacherCk, dataRevision, dispatch]);
}

// 사용자 역할 로드
export async function loadUserRole(
  user: { uid: string; email: string | null },
  dispatch: ReturnType<typeof useApp>['dispatch'],
  isCurrent: () => boolean = () => true,
): Promise<'ok' | 'unauthorized' | 'error' | 'stale'> {
  if (!user?.email) return 'unauthorized';
  const key = emailToKey(user.email);
  try {
    const snap = await get(ref(db, `userRoles/${key}`));
    if (!isCurrent()) return 'stale';
    if (!snap.exists()) {
      // 등록되지 않은 계정 → 로그인 차단
      return 'unauthorized';
    }
    const role = snap.val() as UserRole;
    role._key = key;
    dispatch({ type: 'SET_USER_ROLE', payload: role });

    if (role.role === 'teacher') {
      dispatch({ type: 'SET_PART', payload: role.part ?? '1' });
      dispatch({ type: 'SET_GRADE', payload: role.grade ?? '1' });
      dispatch({ type: 'SET_CLASS', payload: role.class ?? '1' });
    }
    // 관리자 계정은 여기서 아무것도 쓰거나 읽지 않는다.
    //   admins/{uid}           = 플랫폼 통합관리자 (고등부 사역 플랫폼 전권 포함)
    //   attendanceAdmins/{uid} = 출석부 전용 관리자 (이 앱 경로에만 효력)
    // 둘 다 기존 관리자만 쓸 수 있어 앱이 스스로 부여할 수 없다(예전 set(admins/…)는
    // 항상 실패하고 "관리자 정보 동기화에 실패했습니다" 토스트만 남겼다).
    // ⚠ 보유 여부를 확인하려고 admins/{uid}를 읽지도 말 것 — 권한 없는 계정에서
    //   인증 게이트를 막을 수 있다. 권한이 없으면 데이터 구독 오류에서
    //   dataLoadMessage가 "볼 권한이 없습니다"로 정확히 안내한다.
    return 'ok';
  } catch {
    // 일시적인 네트워크·DB 조회 실패는 실제 권한 없음과 구분해 로그인 세션을 보존한다.
    return isCurrent() ? 'error' : 'stale';
  }
}
