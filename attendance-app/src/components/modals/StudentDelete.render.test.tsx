/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AppState } from '@/store/AppContext';
import type { Student } from '@/types';

const m = vi.hoisted(() => ({ state: null as unknown, request: vi.fn<typeof fetch>(), close: vi.fn() }));
vi.mock('@/lib/firebase/client', () => ({ auth: { currentUser: { uid: 'synthetic-admin', getIdToken: async () => 'synthetic-token' } } }));
vi.mock('@/store/AppContext', async original => ({ ...await original<typeof import('@/store/AppContext')>(),
  useApp: () => ({ state: m.state as AppState, dispatch: vi.fn() }) }));

import { initialState } from '@/store/AppContext';
import StudentModal from './StudentModal';

const original: Student = { id: 's', name: '합성 원래 학생', birth: '2010-01-01' };
const other: Student = { id: 'other', name: '보존 학생', personId: 'person_student_other' };
let server: Map<string, unknown>;
beforeEach(() => {
  vi.clearAllMocks();
  m.state = { ...initialState, curYear: 2026, curPart: '1', curGrade: '1', curClass: '1',
    userRole: { role: 'admin' }, dataLoaded: { classes: true, attendance: true, events: true }, classData: { '1-1-1': { teacher: '합성 교사', students: [{ ...original }, other] } } };
  server = new Map();
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_DATABASE_URL', 'https://synthetic.firebaseio.test'); vi.stubGlobal('fetch', m.request);
  m.request.mockImplementation(async (url, options = {}) => {
    const path = decodeURIComponent(new URL(String(url)).pathname.slice(1, -5));
    const value = server.get(path) ?? null, etag = JSON.stringify(encodeURIComponent(JSON.stringify(value)));
    if (options.method === 'PUT') {
      if ((options.headers as Record<string, string>)['If-Match'] !== etag) return new Response('null', { status: 412 });
      server.set(path, JSON.parse(options.body as string));
    }
    return new Response(JSON.stringify(server.get(path) ?? null), { headers: { etag } });
  });
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function confirmDelete() {
  fireEvent.click(screen.getByRole('button', { name: '삭제' }));
  fireEvent.click(screen.getByRole('button', { name: '삭제' }));
}

it.each([undefined, 'person_student_replacement'])('수정창을 연 legacy 학생이 같은 SID의 다른 학생(%s)으로 교체되면 삭제를 거절한다', async personId => {
  const replacement: Student = { id: original.id, name: '합성 다른 학생', birth: '2010-02-02', ...(personId ? { personId } : {}) };
  const view = render(<StudentModal editId={original.id} onClose={m.close} />);
  const state = m.state as AppState;
  state.classData = { '1-1-1': { teacher: '합성 교사', students: [replacement, other] } };
  view.rerender(<StudentModal editId={original.id} onClose={m.close} />);
  server.set('classes/2026/1-1-1', { teacher: '합성 교사', students: { s: replacement, other } });
  confirmDelete();
  expect((await screen.findByRole('alert')).textContent).toContain('학생 연결이 변경');
  expect(m.request.mock.calls.some(([, options]) => options?.method === 'PUT')).toBe(false);
  expect(m.close).not.toHaveBeenCalled();
  expect(screen.getByLabelText('이름 *')).toHaveProperty('value', original.name);
});

it('확인한 legacy 학생은 다른 학생과 기존 출석을 건드리지 않고 복구 사본과 감사 이력을 남긴다', async () => {
  const roster = { teacher: '합성 교사', students: { s: original, other } };
  server.set('classes/2026/1-1-1', roster);
  render(<StudentModal editId={original.id} onClose={m.close} />);
  confirmDelete();
  await waitFor(() => expect(m.close).toHaveBeenCalledOnce());
  const copies = [...server.entries()].filter(([path]) => path.startsWith('trash/'));
  expect(copies).toHaveLength(1); expect(copies[0][1]).toMatchObject({ ...original, ck: '1-1-1' });
  const saved = server.get('classes/2026/1-1-1') as { students: Record<string, Student>; adminChanges: Record<string, { action: string }> };
  expect(saved?.students).toEqual({ other });
  expect(Object.values(saved?.adminChanges ?? {})).toEqual([expect.objectContaining({ action: '학생 삭제' })]);
  expect(m.request.mock.calls.some(([url]) => new URL(String(url)).pathname.startsWith('/attendance/'))).toBe(false);
});
