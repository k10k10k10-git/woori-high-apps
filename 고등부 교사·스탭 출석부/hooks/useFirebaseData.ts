'use client';

import { useEffect, useRef } from 'react';
import { ref, onValue, set, get, push } from 'firebase/database';
import { db } from '@/lib/firebase';
import { useApp } from '@/store/AppContext';
import { sortAndRenumber, emailToKey } from '@/utils/dates';
import type { AttData, CustomEventData, UserRole, Member, StaffTeam } from '@/types';
import { STAFF_TEAMS } from '@/types';

// ─── Firebase 실시간 구독 훅 ──────────────────────────────────
export function useFirebaseData() {
  const { state, dispatch } = useApp();
  const { curYear, fbReady } = state;
  const unsubRef = useRef<(() => void)[]>([]);

  useEffect(() => {
    if (!fbReady) return;

    unsubRef.current.forEach(fn => fn());
    unsubRef.current = [];

    // ── 1부/2부 교사: 기존 출석부 classes DB 실시간 구독 ──────
    const classesRef = ref(db, `classes/${curYear}`);
    const unsub1 = onValue(classesRef, snap => {
      const raw = snap.exists()
        ? (snap.val() as Record<string, { teacher?: string }>)
        : {};

      const seen1 = new Set<string>();
      const seen2 = new Set<string>();
      const part1Members: Member[] = [];
      const part2Members: Member[] = [];

      const sortedKeys = Object.keys(raw).sort((a, b) => {
        const [pa, ga, ca] = a.split('-').map(Number);
        const [pb, gb, cb] = b.split('-').map(Number);
        if (pa !== pb) return pa - pb;
        if (ga !== gb) return ga - gb;
        return ca - cb;
      });

      sortedKeys.forEach(ck => {
        const teacherName = raw[ck]?.teacher?.trim();
        if (!teacherName) return;

        if (ck.startsWith('1-')) {
          if (!seen1.has(teacherName)) {
            seen1.add(teacherName);
            part1Members.push({ id: ck, name: teacherName });
          }
        } else if (ck.startsWith('2-')) {
          if (!seen2.has(teacherName)) {
            seen2.add(teacherName);
            part2Members.push({ id: ck, name: teacherName });
          }
        }
      });

      dispatch({
        type: 'SET_PART_TEACHERS',
        payload: {
          part1: sortAndRenumber(part1Members),
          part2: sortAndRenumber(part2Members),
        },
      });
    });
    unsubRef.current.push(unsub1);

    // ── 사역팀별 스탭: 각 팀 실시간 구독 ────────────────────
    STAFF_TEAMS.forEach(team => {
      const teamRef = ref(db, `staff_members/${curYear}/${team}`);
      const unsub = onValue(teamRef, snap => {
        const raw = snap.exists()
          ? (snap.val() as Record<string, { name: string; num?: number; phone?: string }>)
          : {};
        const members = sortAndRenumber(
          Object.entries(raw).map(([id, m]) => ({ id, ...m } as Member))
        );
        dispatch({ type: 'SET_STAFF_TEAM_MEMBERS', payload: { team, members } });
      });
      unsubRef.current.push(unsub);
    });

    // ── 출석 데이터 구독 ──────────────────────────────────────
    const attRef = ref(db, `staff_attendance/${curYear}`);
    const unsub3 = onValue(attRef, snap => {
      dispatch({
        type: 'SET_ATT_DATA',
        payload: snap.exists() ? (snap.val() as AttData) : {},
      });
    });
    unsubRef.current.push(unsub3);

    // ── 커스텀 이벤트 구독 ────────────────────────────────────
    const evRef = ref(db, `staff_events/${curYear}`);
    const unsub4 = onValue(evRef, snap => {
      dispatch({
        type: 'SET_CUSTOM_EVENTS',
        payload: snap.exists() ? (snap.val() as CustomEventData) : {},
      });
    });
    unsubRef.current.push(unsub4);

    return () => {
      unsubRef.current.forEach(fn => fn());
      unsubRef.current = [];
    };
  }, [fbReady, curYear, dispatch]);
}

// ─── 사용자 역할 로드 ─────────────────────────────────────────
export async function loadUserRole(
  user: { uid: string; email: string | null },
  dispatch: ReturnType<typeof useApp>['dispatch']
): Promise<'ok' | 'unauthorized'> {
  if (!user?.email) return 'unauthorized';
  const key = emailToKey(user.email);
  try {
    const snap = await get(ref(db, `staff_roles/${key}`));
    if (!snap.exists()) return 'unauthorized';
    const role = snap.val() as UserRole;
    role._key = key;
    dispatch({ type: 'SET_USER_ROLE', payload: role });
    if (role.role === 'admin') {
      set(ref(db, `staff_admins/${user.uid}`), true).catch(() => {});
    }
    return 'ok';
  } catch {
    return 'unauthorized';
  }
}

// ─── 출석 저장 ────────────────────────────────────────────────
export async function saveAttToFirebase(
  year: number,
  gk: string,
  memberId: string,
  cellKey: string,
  value: string,
  onSaving: () => void,
  onSaved: () => void,
) {
  onSaving();
  const path = `staff_attendance/${year}/${gk}/${memberId}/${cellKey}`;
  try {
    await set(ref(db, path), value === '' ? null : value);
    onSaved();
  } catch (e) {
    console.error('출석 저장 실패:', e);
    onSaved();
  }
}

// ─── 스탭 멤버 추가 ───────────────────────────────────────────
export async function addStaffMember(year: number, team: string, name: string, phone: string, maxNum: number) {
  await push(ref(db, `staff_members/${year}/${team}`), {
    name: name.trim(),
    phone: phone.trim() || null,
    num: maxNum + 1,
  });
}

// ─── 스탭 멤버 수정 ───────────────────────────────────────────
export async function updateStaffMember(year: number, team: string, id: string, name: string, phone: string, num: number) {
  await set(ref(db, `staff_members/${year}/${team}/${id}`), {
    name: name.trim(),
    phone: phone.trim() || null,
    num,
  });
}

// ─── 스탭 멤버 삭제 ───────────────────────────────────────────
export async function deleteStaffMember(year: number, team: string, id: string) {
  await set(ref(db, `staff_members/${year}/${team}/${id}`), null);
}

// ─── 스탭 멤버 팀 이동 (출석 기록 포함) ──────────────────────
export async function moveStaffMemberToTeam(
  year: number,
  fromTeam: string,
  toTeam: string,
  id: string,
  name: string,
  phone: string,
  num: number,
  toTeamMemberCount: number,
) {
  const attSnap = await get(ref(db, `staff_attendance/${year}/${fromTeam}/${id}`));
  const attData = attSnap.exists() ? attSnap.val() : null;

  await set(ref(db, `staff_members/${year}/${toTeam}/${id}`), {
    name: name.trim(),
    phone: phone.trim() || null,
    num: toTeamMemberCount + 1,
  });

  if (attData) {
    await set(ref(db, `staff_attendance/${year}/${toTeam}/${id}`), attData);
    await set(ref(db, `staff_attendance/${year}/${fromTeam}/${id}`), null);
  }

  await set(ref(db, `staff_members/${year}/${fromTeam}/${id}`), null);
}

// ─── 스탭 순서 변경 ───────────────────────────────────────────
export async function swapStaffOrder(
  year: number,
  team: string,
  id1: string, num1: number | undefined,
  id2: string, num2: number | undefined,
) {
  await Promise.all([
    set(ref(db, `staff_members/${year}/${team}/${id1}/num`), num2),
    set(ref(db, `staff_members/${year}/${team}/${id2}/num`), num1),
  ]);
}
