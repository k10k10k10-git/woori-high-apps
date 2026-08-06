'use client';
import { useEffect, useRef } from 'react';
import { db, ref, onValue, set, get } from '@/lib/db';
import { useApp } from '@/store/AppContext';
import { sortAndRenumber, emailToKey } from '@/utils/dates';
import { showToast } from '@/utils/toast';
import { dataLoadMessage } from '@/utils/dbError';
import type { ClassDataMap, AttData, CustomEventData, UserRole, Student } from '@/types';

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
      ? sortAndRenumber(Object.entries(fc.students).map(([id, s]) => ({ id, ...s as object })) as Student[])
      : [],
  };
}

// Firebase 실시간 구독 훅
// 보안/프라이버시: 교사 계정은 본인 반(classes/{year}/{ck})만 구독한다.
// 관리자만 전체 트리(classes/{year})를 구독한다. 보안 규칙도 이에 맞춰 read를 제한한다.
export function useFirebaseData() {
  const { state, dispatch } = useApp();
  const { curYear, fbReady, userRole } = state;
  const role = userRole?.role;
  const teacherCk = role === 'teacher'
    ? `${userRole!.part ?? '1'}-${userRole!.grade ?? '1'}-${userRole!.class ?? '1'}`
    : null;
  const unsubRef = useRef<(() => void)[]>([]);

  useEffect(() => {
    if (!fbReady || !role) return;

    // 기존 구독 해제
    unsubRef.current.forEach(fn => fn());
    unsubRef.current = [];

    // 학생/반 데이터 구독 — 교사는 본인 반만, 관리자는 전체
    if (teacherCk) {
      const classRef = ref(db, `classes/${curYear}/${teacherCk}`);
      const unsub1 = onValue(classRef, snap => {
        dispatch({
          type: 'SET_CLASS_DATA',
          payload: snap.exists() ? { [teacherCk]: toClassInfo(snap.val() as FbClass) } : {},
        });
      }, err => {
        console.error('학생/반 데이터 구독 오류:', err);
        showToast(dataLoadMessage('학생/반', err));
      });
      unsubRef.current.push(unsub1);

      const attRef = ref(db, `attendance/${curYear}/${teacherCk}`);
      const unsub2 = onValue(attRef, snap => {
        dispatch({
          type: 'SET_ATT_DATA',
          payload: snap.exists() ? { [teacherCk]: snap.val() } as AttData : {},
        });
      }, err => {
        console.error('출석 데이터 구독 오류:', err);
        showToast(dataLoadMessage('출석', err));
      });
      unsubRef.current.push(unsub2);
    } else {
      const classRef = ref(db, `classes/${curYear}`);
      const unsub1 = onValue(classRef, snap => {
        if (!snap.exists()) {
          dispatch({ type: 'SET_CLASS_DATA', payload: {} });
          return;
        }
        const fbClasses = snap.val() as Record<string, FbClass>;
        const newData: ClassDataMap = {};
        Object.keys(fbClasses).forEach(ck => { newData[ck] = toClassInfo(fbClasses[ck]); });
        dispatch({ type: 'SET_CLASS_DATA', payload: newData });
      }, err => {
        console.error('학생/반 데이터 구독 오류:', err);
        showToast(dataLoadMessage('학생/반', err));
      });
      unsubRef.current.push(unsub1);

      const attRef = ref(db, `attendance/${curYear}`);
      const unsub2 = onValue(attRef, snap => {
        dispatch({
          type: 'SET_ATT_DATA',
          payload: snap.exists() ? (snap.val() as AttData) : {},
        });
      }, err => {
        console.error('출석 데이터 구독 오류:', err);
        showToast(dataLoadMessage('출석', err));
      });
      unsubRef.current.push(unsub2);
    }

    // 커스텀 이벤트 구독 (연휴·특별일정 — 개인정보 아님, 전체 구독)
    const evRef = ref(db, `events/${curYear}`);
    const unsub3 = onValue(evRef, snap => {
      dispatch({
        type: 'SET_CUSTOM_EVENTS',
        payload: snap.exists() ? (snap.val() as CustomEventData) : {},
      });
    }, err => {
      console.error('이벤트 데이터 구독 오류:', err);
      showToast(dataLoadMessage('이벤트', err));
    });
    unsubRef.current.push(unsub3);

    return () => {
      unsubRef.current.forEach(fn => fn());
      unsubRef.current = [];
    };
  }, [fbReady, curYear, role, teacherCk, dispatch]);
}

// 사용자 역할 로드
export async function loadUserRole(
  user: { uid: string; email: string | null },
  dispatch: ReturnType<typeof useApp>['dispatch']
): Promise<'ok' | 'unauthorized'> {
  if (!user?.email) return 'unauthorized';
  const key = emailToKey(user.email);
  try {
    const snap = await get(ref(db, `userRoles/${key}`));
    if (!snap.exists()) {
      // 등록되지 않은 계정 → 로그인 차단
      return 'unauthorized';
    }
    const role = snap.val() as UserRole;
    role._key = key;
    dispatch({ type: 'SET_USER_ROLE', payload: role });

    if (role.role === 'teacher') {
      const ck = `${role.part ?? '1'}-${role.grade ?? '1'}-${role.class ?? '1'}`;
      dispatch({ type: 'SET_PART', payload: role.part ?? '1' });
      dispatch({ type: 'SET_GRADE', payload: role.grade ?? '1' });
      dispatch({ type: 'SET_CLASS', payload: role.class ?? '1' });
      // 반 구독 read 규칙이 teacherClasses/{uid}===ck 를 검사하므로,
      // 데이터 구독 전에 반드시 기록되도록 await 한다.
      try {
        await set(ref(db, `teacherClasses/${user.uid}`), ck);
      } catch {
        showToast('교사 반 정보 동기화에 실패했습니다.', 'error');
      }
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
    return 'unauthorized';
  }
}

// 오래된 연도 정리 (관리자)
export async function cleanupOldYears(windowYears: number[]) {
  try {
    const pathsToCheck = ['classes', 'attendance', 'events'];
    for (const p of pathsToCheck) {
      const snap = await get(ref(db, p));
      if (!snap.exists()) continue;
      const years = Object.keys(snap.val()).map(Number);
      for (const y of years) {
        if (!windowYears.includes(y)) {
          await set(ref(db, `${p}/${y}`), null);
        }
      }
    }
  } catch (e) {
    console.warn('연도 정리 실패:', e);
  }
}
