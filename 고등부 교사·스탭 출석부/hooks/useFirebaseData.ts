'use client';

import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/store/AppContext';
import { sortAndRenumber, emailToKey } from '@/utils/dates';
import type { AttData, CustomEventData, UserRole, Member } from '@/types';
import { STAFF_TEAMS } from '@/types';
import {
  getUserRole,
  markStaffAdmin,
  subscribeClasses,
  subscribeStaffAttendance,
  subscribeStaffEvents,
  subscribeStaffMembers,
} from '@/lib/db';

// Firebase 실시간 구독을 한 곳에서 열고, 권한/네트워크 오류를 화면에 전달한다.
export function useFirebaseData() {
  const { state, dispatch } = useApp();
  const { curYear, fbReady } = state;
  const unsubRef = useRef<(() => void)[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!fbReady) return;

    unsubRef.current.forEach(fn => fn());
    unsubRef.current = [];
    setLoadError(null);

    const fail = (scope: string) => (error: Error) => {
      console.error(`${scope} 구독 실패:`, error);
      setLoadError(`${scope} 데이터를 불러오지 못했습니다. 권한과 네트워크를 확인해주세요.`);
    };

    const unsubClasses = subscribeClasses(curYear, value => {
      const raw = value as Record<string, { teacher?: string }>;
      const seen1 = new Set<string>();
      const seen2 = new Set<string>();
      const part1Members: Member[] = [];
      const part2Members: Member[] = [];

      const sortedKeys = Object.keys(raw).sort((a, b) => {
        const [pa, ga, ca] = a.split('-').map(Number);
        const [pb, gb, cb] = b.split('-').map(Number);
        return pa - pb || ga - gb || ca - cb;
      });

      sortedKeys.forEach(ck => {
        const teacherName = raw[ck]?.teacher?.trim();
        if (!teacherName) return;
        if (ck.startsWith('1-') && !seen1.has(teacherName)) {
          seen1.add(teacherName);
          part1Members.push({ id: ck, name: teacherName });
        } else if (ck.startsWith('2-') && !seen2.has(teacherName)) {
          seen2.add(teacherName);
          part2Members.push({ id: ck, name: teacherName });
        }
      });

      dispatch({
        type: 'SET_PART_TEACHERS',
        payload: { part1: sortAndRenumber(part1Members), part2: sortAndRenumber(part2Members) },
      });
    }, fail('교사 명단'));
    unsubRef.current.push(unsubClasses);

    STAFF_TEAMS.forEach(team => {
      const unsub = subscribeStaffMembers(curYear, team, value => {
        const raw = value as Record<string, { name: string; num?: number; phone?: string }>;
        const members = sortAndRenumber(
          Object.entries(raw).map(([id, member]) => ({ id, ...member } as Member)),
        );
        dispatch({ type: 'SET_STAFF_TEAM_MEMBERS', payload: { team, members } });
      }, fail(`${team} 명단`));
      unsubRef.current.push(unsub);
    });

    const unsubAttendance = subscribeStaffAttendance(curYear, value => {
      dispatch({ type: 'SET_ATT_DATA', payload: value as AttData });
    }, fail('출석'));
    unsubRef.current.push(unsubAttendance);

    const unsubEvents = subscribeStaffEvents(curYear, value => {
      dispatch({ type: 'SET_CUSTOM_EVENTS', payload: value as CustomEventData });
    }, fail('이벤트'));
    unsubRef.current.push(unsubEvents);

    return () => {
      unsubRef.current.forEach(fn => fn());
      unsubRef.current = [];
    };
  }, [fbReady, curYear, dispatch]);

  return loadError;
}

export async function loadUserRole(
  user: { uid: string; email: string | null },
  dispatch: ReturnType<typeof useApp>['dispatch'],
): Promise<'ok' | 'unauthorized'> {
  if (!user.email) return 'unauthorized';
  const key = emailToKey(user.email);
  try {
    const role = await getUserRole(key);
    if (!role) return 'unauthorized';
    const roleWithKey: UserRole = { ...role, _key: key };
    dispatch({ type: 'SET_USER_ROLE', payload: roleWithKey });
    if (role.role === 'admin') void markStaffAdmin(user.uid).catch(() => {});
    return 'ok';
  } catch {
    return 'unauthorized';
  }
}
