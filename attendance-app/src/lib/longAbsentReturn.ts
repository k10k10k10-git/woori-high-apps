import { auth } from '@/lib/firebase/client';
import { isDemoAccount } from '@/lib/demo';
import { withBrowserWriteLock } from '@/utils/browserWriteLock';
import { buildAdminChangeEntry } from '@/utils/adminChange';
import { mergeStudentEdit } from '@/utils/studentPersistence';
import type { Student } from '@/types';

type StoredClass = { students?: Record<string, Student>; teacher?: string; adminChanges?: Record<string, unknown> };

/** 최신 반에서 동일 학생의 장결 상태만 변경한다. 출석·연락처·다른 학생은 건드리지 않는다. */
export function buildLongAbsentReturn(current: StoredClass | null, opened: Student, classKey: string, changeId: string, actor: string, now: Date, nextJang = false) {
  const raw = current?.students?.[opened.id];
  if (!current || !raw || typeof raw.name !== 'string' || (opened.jang === true) === nextJang) return undefined;
  const latest = { ...raw, id: opened.id };
  if (!mergeStudentEdit(latest, opened, opened)) return undefined;
  if ((raw.jang === true) === nextJang) return current; // 이미 같은 상태면 중복 이력을 만들지 않는다.
  return { ...current, students: { ...current.students, [opened.id]: { ...raw, jang: nextJang } },
    adminChanges: { ...current.adminChanges, [changeId]: buildAdminChangeEntry({
      classKey, teacher: current.teacher, student: latest, action: '학생 정보 수정',
      changeSummary: nextJang ? '일반 학생 → 장결자로 지정 · 기존 출석 이력 유지' : '장결 학생 → 일반 명단 복귀 · 기존 출석 이력 유지', actor, now,
    }) } };
}

type ReturnInput = { year: number; classKey: string; student: Student; actor: string; nextJang?: boolean };
type Connection = { databaseUrl: string; getToken: () => Promise<string>; isCurrent: () => boolean; fetch?: typeof fetch; timeoutMs?: number };

/** 최신 반 전체의 ETag 조건으로 학생 상태와 감사 한 건만 원자 반영한다. 지연 재생·자동 재전송은 없다. */
export async function compareAndReturnLongAbsent(input: ReturnInput, connection: Connection) {
  const operation = input.nextJang === true ? '장결 지정' : '복귀';
  const list = input.nextJang === true ? '장결 명단' : '일반 명단';
  if (!Number.isInteger(input.year) || [input.classKey, input.student.id].some(key => !key || /[.#$\[\]/\u0000-\u001f]/.test(key))) throw new Error('학생 명단 경로를 확인해 주세요.');
  const controller = new AbortController();
  let sent = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const check = () => {
    if (!connection.isCurrent()) throw new Error(`관리자 로그인 또는 조회 상태가 변경되어 ${operation} 작업을 중단했습니다.`);
    if (controller.signal.aborted) throw new Error('연결 확인이 지연되었습니다. 새로고침한 뒤 다시 진행해 주세요.');
  };
  const work = async () => {
    check();
    const token = await connection.getToken();
    check();
    const url = new URL(connection.databaseUrl);
    url.pathname = `/classes/${input.year}/${encodeURIComponent(input.classKey)}.json`;
    url.searchParams.set('auth', token);
    const request = connection.fetch ?? globalThis.fetch;
    const options = { cache: 'no-store' as const, signal: controller.signal };
    const response = await request(url.toString(), { ...options, headers: { 'X-Firebase-ETag': 'true' } });
    if (!response.ok) throw new Error('명단을 확인하지 못했습니다. 연결과 관리자 권한을 확인해 주세요.');
    const current: StoredClass | null = await response.json();
    check();
    const next = buildLongAbsentReturn(current, input.student, input.classKey, crypto.randomUUID(), input.actor, new Date(), input.nextJang);
    if (!next) throw new Error('학생이 삭제·이동되었거나 연결 정보가 변경되었습니다. 최신 명단에서 다시 열어 주세요.');
    if (next === current) return;
    const etag = response.headers.get('etag');
    if (!etag) throw new Error('안전한 저장을 확인하지 못했습니다. 새로고침한 뒤 다시 진행해 주세요.');
    check(); sent = true;
    const result = await request(url.toString(), { ...options, method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': etag }, body: JSON.stringify(next) });
    if (result.status === 412) throw new Error(`다른 작업에서 명단을 변경했습니다. ${operation}하지 않았습니다. 최신 명단에서 다시 열어 주세요.`);
    if (result.status >= 400 && result.status < 500) throw new Error(`${operation} 요청이 거절되었습니다. 관리자 권한 또는 진행 중인 학생 이동을 확인해 주세요.`);
    if (!result.ok || controller.signal.aborted) throw new Error(`${operation} 결과를 확인하지 못했습니다. 새로고침해 ${list}을 확인한 뒤 다시 진행해 주세요.`);
  };
  try {
    await Promise.race([work(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(sent ? `${operation} 결과를 확인하지 못했습니다. 새로고침해 ${list}을 확인해 주세요.` : `연결 확인이 지연되어 ${operation}하지 않았습니다. 연결 후 다시 진행해 주세요.`));
      }, connection.timeoutMs ?? 15000);
    })]);
  } catch (cause) {
    if (controller.signal.aborted || !(cause instanceof Error) || cause.name === 'TypeError') throw new Error(sent ? `${operation} 결과를 확인하지 못했습니다. 새로고침해 ${list}을 확인해 주세요.` : `연결을 확인하지 못해 ${operation}하지 않았습니다. 인터넷 연결 후 다시 진행해 주세요.`);
    throw cause;
  } finally { clearTimeout(timer); }
}

export function returnLongAbsentStudent(input: ReturnInput, isCurrent: () => boolean) {
  return withBrowserWriteLock('shared', async () => {
    const user = auth.currentUser;
    if (!user || isDemoAccount(user.email)) throw new Error('관리자 계정으로 로그인해 주세요.');
    return compareAndReturnLongAbsent(input, { databaseUrl: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ?? '',
      getToken: () => user.getIdToken(), isCurrent: () => auth.currentUser === user && isCurrent() });
  });
}
