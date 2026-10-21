/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AppState } from '@/store/AppContext';
const m = vi.hoisted(() => ({ state: null as unknown, request: vi.fn<typeof fetch>(), token: vi.fn(), dispatch: vi.fn(), close: vi.fn() }));
vi.mock('@/lib/firebase/client', () => ({ auth: { currentUser: { uid: 'synthetic-admin', getIdToken: m.token } } }));
vi.mock('@/store/AppContext', async original => ({ ...await original<typeof import('@/store/AppContext')>(), useApp: () => ({ state: m.state as AppState, getState: () => m.state as AppState, dispatch: m.dispatch }) }));
import { initialState } from '@/store/AppContext';
import StudentModal from './StudentModal';
import TeacherModal from './TeacherModal';
import AddClassModal from './AddClassModal';

const student = { id: 's', name: '합성 학생', personId: 'person_student_s', phone: 'old' };
let server: Map<string, unknown>, loseResponse: boolean;
const pathOf = (url: RequestInfo | URL) => decodeURIComponent(new URL(String(url)).pathname.slice(1, -5));
beforeEach(() => {
  vi.clearAllMocks(); loseResponse = false;
  m.state = { ...initialState, curYear: 2026, curPart: '1', curGrade: '1', curClass: '1', dataRevision: 4,
    userRole: { role: 'admin' }, dataLoaded: { classes: true, attendance: true, events: true },
    classData: { '1-1-1': { teacher: '원래 교사', students: [{ ...student }] } } };
  server = new Map([['classes/2026/1-1-1', { teacher: '원래 교사', students: { s: { ...student } } }]]);
  m.token.mockResolvedValue('synthetic-token');
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_DATABASE_URL', 'https://synthetic.firebaseio.test'); vi.stubGlobal('fetch', m.request);
  m.request.mockImplementation(async (url, init = {}) => {
    const path = pathOf(url), value = server.get(path) ?? null;
    const etag = JSON.stringify(encodeURIComponent(JSON.stringify(value)));
    if (init.method === 'PUT') {
      if ((init.headers as Record<string, string>)['If-Match'] !== etag) return new Response('null', { status: 412 });
      server.set(path, JSON.parse(init.body as string));
      if (loseResponse) { loseResponse = false; throw new TypeError('response lost'); }
    }
    return new Response(JSON.stringify(server.get(path) ?? null), { headers: { etag } });
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function openForm(kind: string) {
  const view = render(kind === 'student' ? <StudentModal editId="s" onClose={m.close} /> : kind === 'teacher' ? <TeacherModal onClose={m.close} /> : <AddClassModal onClose={m.close} />);
  if (kind === 'student') fireEvent.change(screen.getByLabelText('학교'), { target: { value: '수정 학교' } });
  if (kind === 'teacher') fireEvent.change(screen.getByLabelText('교사 이름'), { target: { value: '수정 교사' } });
  if (kind === 'class') fireEvent.change(screen.getByLabelText('반 번호 *'), { target: { value: '2' } });
  const submit = () => fireEvent.click(screen.getByRole('button', { name: kind === 'student' ? '저장' : kind === 'teacher' ? '교사 정보 저장' : '반 추가' }));
  return { view, submit };
}

it.each(['student', 'teacher', 'class'])('%s 저장 토큰이 멈추면 15초 뒤 입력과 닫기 경로를 복구하고 늦은 응답은 쓰지 않는다', async kind => {
  vi.useFakeTimers(); let deliver!: (token: string) => void;
  m.token.mockReturnValue(new Promise<string>(resolve => { deliver = resolve; }));
  const { submit } = openForm(kind);
  submit();
  expect(screen.getByRole('dialog').getAttribute('aria-busy')).toBe('true');
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
  expect(screen.getByRole('alert').textContent).toContain('입력은 유지');
  expect(screen.getByRole('dialog').getAttribute('aria-busy')).toBe('false');
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.getByRole('button', { name: '계속 작성' })).toBeTruthy();
  await act(async () => { deliver('synthetic-token'); await vi.advanceTimersByTimeAsync(0); });
  expect(m.request).not.toHaveBeenCalled(); expect(m.close).not.toHaveBeenCalled();
});

it.each(['student', 'teacher', 'class'].flatMap(kind => ['year', 'revision', 'role', 'class', 'unmount'].map(change => ({ kind, change }))))('$kind 저장 전 $change 변경은 이전 반 요청·선택·완료를 막는다', async ({ kind, change }) => {
  let deliver!: (token: string) => void;
  m.token.mockReturnValue(new Promise<string>(resolve => { deliver = resolve; }));
  const { view, submit } = openForm(kind); submit();
  const state = m.state as AppState;
  if (change === 'year') state.curYear++;
  if (change === 'revision') state.dataRevision++;
  if (change === 'role') state.userRole = { role: 'teacher' };
  if (change === 'class') state.curClass = '2';
  if (change === 'unmount') view.unmount();
  await act(async () => { deliver('synthetic-token'); });
  expect(m.request).not.toHaveBeenCalled(); expect(m.dispatch).not.toHaveBeenCalled(); expect(m.close).not.toHaveBeenCalled();
  if (change !== 'unmount') expect(screen.getByRole('alert').textContent).toContain('조회 상태가 변경');
});

it('학생 추가 응답 유실 재시도는 원래 학생 ID·감사 표식으로 확인하고 두 번째 학생을 만들지 않는다', async () => {
  render(<StudentModal editId={null} onClose={m.close} />);
  fireEvent.change(screen.getByLabelText('이름 *'), { target: { value: '합성 신규 학생' } });
  loseResponse = true;
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await screen.findByRole('alert');
  expect(m.close).not.toHaveBeenCalled();
  const first = structuredClone(server.get('classes/2026/1-1-1'));
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(m.close).toHaveBeenCalledOnce());
  expect(server.get('classes/2026/1-1-1')).toEqual(first);
  expect(m.request.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(1);
  expect(Object.keys((first as { students: object }).students)).toHaveLength(2);
});

it('화면의 무변경 학생 연락처와 다른 학생·장결·추가 필드는 최신 반에서 보존한다', async () => {
  const { submit } = openForm('student');
  server.set('classes/2026/1-1-1', { teacher: '원격 교사', students: { s: { ...student, phone: 'remote', jang: true, num: 7, extra: '보존' }, other: { id: 'other', name: '다른 학생' } }, extra: '반 메타 보존' });
  submit(); await waitFor(() => expect(m.close).toHaveBeenCalledOnce());
  expect(server.get('classes/2026/1-1-1')).toMatchObject({ teacher: '원격 교사', students: { s: { phone: 'remote', jang: true, num: 7, extra: '보존', school: '수정 학교' }, other: { name: '다른 학생' } }, extra: '반 메타 보존' });
  expect(m.request.mock.calls.some(([url]) => pathOf(url).startsWith('attendance/'))).toBe(false);
});
