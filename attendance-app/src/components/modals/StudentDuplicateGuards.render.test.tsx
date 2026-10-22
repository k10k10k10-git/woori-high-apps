/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AppState } from '@/store/AppContext';
import type { Student } from '@/types';

const m = vi.hoisted(() => ({ state: null as unknown, token: vi.fn(), request: vi.fn<typeof fetch>(), close: vi.fn() }));
vi.mock('@/lib/firebase/client', () => ({ auth: { currentUser: { uid: 'synthetic-admin', getIdToken: m.token } } }));
vi.mock('@/store/AppContext', async original => ({ ...await original<typeof import('@/store/AppContext')>(),
  useApp: () => ({ state: m.state as AppState, getState: () => m.state as AppState, dispatch: vi.fn() }),
}));
import { initialState } from '@/store/AppContext';
import StudentModal from './StudentModal';
import RosterModal from './RosterModal';

type ClassData = { teacher?: string; students: Record<string, Student>; [key: string]: unknown };
let classes: Record<string, ClassData>, copies: Record<string, unknown>, lostResponse: boolean;
const original: Student = { id: 's', name: '합성 기존', birth: '2010-01-01', phone: '01011112222', personId: 'person_student_original', jang: true, num: 7 };
const newcomer = { name: '합성 신규', birth: '2010-02-02', phone: '01033334444' };
const pathOf = (url: RequestInfo | URL) => decodeURIComponent(new URL(String(url)).pathname.slice(1, -5));
const putCalls = () => m.request.mock.calls.filter(([, init]) => init?.method === 'PUT');
function read(path: string): unknown {
  if (path === 'classes') return { 2026: classes };
  if (path === 'classes/2026') return classes;
  if (path.startsWith('classes/2026/')) return classes[path.split('/')[2]] ?? null;
  return copies[path] ?? null;
}

beforeEach(() => {
  vi.clearAllMocks(); copies = {}; lostResponse = false;
  classes = { '1-1-1': { teacher: '원래 교사', students: { s: { ...original } }, extra: '반 메타' }, '2-1-6': { students: {} } };
  m.state = { ...initialState, curYear: 2026, curPart: '1', curGrade: '1', curClass: '1', dataRevision: 4,
    userRole: { role: 'admin' }, dataLoaded: { classes: true, attendance: true, events: true },
    classData: { '1-1-1': { teacher: '원래 교사', students: [{ ...original }] } } };
  m.token.mockResolvedValue('synthetic-token');
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_DATABASE_URL', 'https://synthetic.firebaseio.test');
  vi.stubGlobal('fetch', m.request);
  m.request.mockImplementation(async (url, init = {}) => {
    const path = pathOf(url), value = read(path), etag = JSON.stringify(encodeURIComponent(JSON.stringify(value)));
    if (init.method === 'PUT') {
      if ((init.headers as Record<string, string>)['If-Match'] !== etag) return new Response('null', { status: 412 });
      const next = JSON.parse(init.body as string);
      if (path.startsWith('classes/2026/')) classes[path.split('/')[2]] = next;
      else copies[path] = next;
      if (lostResponse && path.startsWith('classes/')) { lostResponse = false; throw new TypeError('response lost'); }
    }
    return new Response(JSON.stringify(read(path)), { headers: { etag } });
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function enterStudent(values = newcomer) {
  fireEvent.change(screen.getByLabelText('이름 *'), { target: { value: values.name } });
  fireEvent.change(screen.getByLabelText('생년월일'), { target: { value: values.birth } });
  fireEvent.change(screen.getByLabelText('연락처'), { target: { value: values.phone } });
}
async function previewRoster(text = `${newcomer.name},${newcomer.birth},${newcomer.phone}`) {
  fireEvent.change(screen.getByLabelText('학생 명단'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: '최신 명단과 비교하기' }));
  await screen.findByRole('region', { name: '명단 반영 미리보기' });
}

it('개별 추가는 화면에 없는 다른 반의 최신 서버 명단과 대조하여 중복을 차단한다', async () => {
  classes['2-1-6'].students.other = { id: 'other', ...newcomer };
  const before = structuredClone(classes);
  render(<StudentModal editId={null} onClose={m.close} />); enterStudent();
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  expect((await screen.findByRole('alert')).textContent).toContain('2부 1학년 6반');
  expect(m.request.mock.calls.some(([url]) => pathOf(url) === 'classes/2026')).toBe(true);
  expect(putCalls()).toHaveLength(0); expect(classes).toEqual(before); expect(m.close).not.toHaveBeenCalled();
});

it('학생 신상 변경으로 새 중복이 생기면 막고 입력을 보존한다', async () => {
  classes['2-1-6'].students.other = { id: 'other', ...newcomer };
  render(<StudentModal editId="s" onClose={m.close} />); enterStudent();
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await screen.findByRole('alert');
  expect(putCalls()).toHaveLength(0);
  expect((screen.getByLabelText('이름 *') as HTMLInputElement).value).toBe(newcomer.name);
});

it('기존 중복의 학교 수정은 막지 않으며 원래 학생 ID·장결·번호·다른 반을 보존한다', async () => {
  classes['2-1-6'].students.other = { ...original, id: 'other', personId: 'different_pid' };
  const otherClass = structuredClone(classes['2-1-6']);
  render(<StudentModal editId="s" onClose={m.close} />);
  fireEvent.change(screen.getByLabelText('학교'), { target: { value: '수정 학교' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(m.close).toHaveBeenCalledOnce());
  expect(classes['1-1-1'].students.s).toMatchObject({ ...original, school: '수정 학교' });
  expect(classes['2-1-6']).toEqual(otherClass);
  expect(m.request.mock.calls.some(([url]) => pathOf(url).startsWith('attendance/'))).toBe(false);
});

it('이름이 같아도 유효한 생년월일이 다르면 동명이인 추가를 허용한다', async () => {
  classes['2-1-6'].students.other = { id: 'other', ...newcomer, birth: '2010-03-03' };
  render(<StudentModal editId={null} onClose={m.close} />); enterStudent();
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(m.close).toHaveBeenCalledOnce());
  expect(Object.keys(classes['1-1-1'].students)).toHaveLength(2);
});

it('일괄 미리보기는 다른 반 중복과 입력 행 사이의 정규화된 중복을 모두 차단한다', async () => {
  render(<RosterModal onClose={m.close} />);
  fireEvent.change(screen.getByLabelText('학생 명단'), { target: { value: '합성 신규,2010-02-02,01033334444\n합성 신규,2010. 02. 02,01055556666' } });
  fireEvent.click(screen.getByRole('button', { name: '최신 명단과 비교하기' }));
  await screen.findByRole('alert');
  expect(screen.queryByRole('region', { name: '명단 반영 미리보기' })).toBeNull();
  expect(putCalls()).toHaveLength(0);
});

it('일괄 미리보기 이후 다른 반에 등록된 같은 학생도 적용 직전에 다시 차단한다', async () => {
  render(<RosterModal onClose={m.close} />); await previewRoster();
  classes['2-1-6'].students.other = { id: 'other', ...newcomer };
  const before = structuredClone(classes);
  fireEvent.click(screen.getByRole('button', { name: '확인한 명단 반영' }));
  expect((await screen.findByRole('alert')).textContent).toContain('2부 1학년 6반');
  expect(classes).toEqual(before); expect(putCalls()).toHaveLength(0);
});

it('교체 입력의 이름 띄어쓰기가 달라도 기존 학생을 새 ID로 바꿔 출석 연결을 끊지 않는다', async () => {
  const before = structuredClone(classes);
  render(<RosterModal onClose={m.close} />);
  fireEvent.change(screen.getByLabelText('반영 방식'), { target: { value: 'replace' } });
  fireEvent.change(screen.getByLabelText('학생 명단'), { target: { value: '합성기존,2010-01-01,01011112222' } });
  fireEvent.click(screen.getByRole('button', { name: '최신 명단과 비교하기' }));
  expect((await screen.findByRole('alert')).textContent).toContain('동일 학생');
  expect(screen.queryByRole('region', { name: '명단 반영 미리보기' })).toBeNull();
  expect(classes).toEqual(before); expect(putCalls()).toHaveLength(0);
});

it('기존 연결 학생과 새 학생을 함께 반영해도 기존 학생·반 메타와 출석 경로를 보존한다', async () => {
  const otherClass = structuredClone(classes['2-1-6']);
  render(<RosterModal onClose={m.close} />);
  await previewRoster(`합성 기존,2010-01-01,01011112222\n${newcomer.name},${newcomer.birth},${newcomer.phone}`);
  fireEvent.click(screen.getByRole('button', { name: '확인한 명단 반영' }));
  await waitFor(() => expect(m.close).toHaveBeenCalledOnce());
  expect(classes['1-1-1'].students.s).toEqual(original);
  expect(classes['1-1-1'].extra).toBe('반 메타');
  expect(classes['2-1-6']).toEqual(otherClass);
  expect(Object.keys(classes['1-1-1'].students)).toHaveLength(2);
  expect(putCalls().map(([url]) => pathOf(url))).toEqual(['classes/2026/1-1-1']);
});

it('일괄 반영 응답이 유실되면 같은 작업 표식으로 확인만 하고 재전송하지 않는다', async () => {
  render(<RosterModal onClose={m.close} />); await previewRoster(); lostResponse = true;
  fireEvent.click(screen.getByRole('button', { name: '확인한 명단 반영' }));
  expect((await screen.findByRole('alert')).textContent).toContain('저장 결과를 확인하지 못했습니다');
  const once = structuredClone(classes);
  expect(m.close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '확인한 명단 반영' }));
  await waitFor(() => expect(m.close).toHaveBeenCalledOnce());
  expect(putCalls()).toHaveLength(1); expect(classes).toEqual(once);
});

it.each(['student', 'roster'])('%s 전체 반 최신 조회가 실패하면 쓰지 않고 입력·닫기 경로를 보존한다', async kind => {
  const request = m.request.getMockImplementation()!;
  m.request.mockImplementation((url, init) => pathOf(url) === 'classes/2026'
    ? Promise.reject(new TypeError('offline')) : request(url, init));
  render(kind === 'student' ? <StudentModal editId={null} onClose={m.close} /> : <RosterModal onClose={m.close} />);
  if (kind === 'student') { enterStudent(); fireEvent.click(screen.getByRole('button', { name: '저장' })); }
  else {
    fireEvent.change(screen.getByLabelText('학생 명단'), { target: { value: newcomer.name } });
    fireEvent.click(screen.getByRole('button', { name: '최신 명단과 비교하기' }));
  }
  expect((await screen.findByRole('alert')).textContent).toContain('입력은 유지');
  expect(screen.getByRole('dialog').getAttribute('aria-busy')).toBe('false');
  expect(putCalls()).toHaveLength(0); expect(m.close).not.toHaveBeenCalled();
});

it('일괄 반영 직전 같은 반이 바뀌면 ETag 충돌로 중단하고 원격 정보를 덮지 않는다', async () => {
  render(<RosterModal onClose={m.close} />); await previewRoster();
  const request = m.request.getMockImplementation()!;
  m.request.mockImplementation((url, init) => {
    if (init?.method === 'PUT' && pathOf(url) === 'classes/2026/1-1-1') classes['1-1-1'].students.s.school = '원격 수정';
    return request(url, init);
  });
  fireEvent.click(screen.getByRole('button', { name: '확인한 명단 반영' }));
  expect((await screen.findByRole('alert')).textContent).toContain('자동 덮어쓰기 없이 중단');
  expect(classes['1-1-1'].students.s.school).toBe('원격 수정');
  expect(Object.keys(classes['1-1-1'].students)).toEqual(['s']); expect(m.close).not.toHaveBeenCalled();
});

it('명단 조회 중 반·연도가 바뀌면 늦은 미리보기나 쓰기를 적용하지 않는다', async () => {
  let deliver!: (response: Response) => void;
  m.request.mockImplementationOnce(() => new Promise<Response>(resolve => { deliver = resolve; }));
  render(<RosterModal onClose={m.close} />);
  fireEvent.change(screen.getByLabelText('학생 명단'), { target: { value: '합성 신규,2010-02-02' } });
  fireEvent.click(screen.getByRole('button', { name: '최신 명단과 비교하기' }));
  await waitFor(() => expect(m.request).toHaveBeenCalledOnce());
  (m.state as AppState).curYear = 2027;
  await act(async () => { deliver(new Response(JSON.stringify(classes), { headers: { etag: 'synthetic' } })); });
  expect((await screen.findByRole('alert')).textContent).toContain('조회 상태가 변경');
  expect(screen.queryByRole('region', { name: '명단 반영 미리보기' })).toBeNull();
  expect(putCalls()).toHaveLength(0); expect(m.close).not.toHaveBeenCalled();
});
