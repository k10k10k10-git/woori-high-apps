/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { AppState } from '@/store/AppContext';
const fixture = vi.hoisted(() => ({ state: null as unknown }));
vi.mock('@/lib/db', () => ({ db: {}, ref: vi.fn(), get: vi.fn(), update: vi.fn(), set: vi.fn(), push: vi.fn(), onValue: vi.fn() }));
vi.mock('@/lib/firebase/client', () => ({ auth: { currentUser: null } }));
vi.mock('@/lib/rosterRecovery', () => ({ archiveRoster: vi.fn() }));
vi.mock('@/store/AppContext', async original => ({ ...await original<typeof import('@/store/AppContext')>(), useApp: () => ({ state: fixture.state as AppState, dispatch: vi.fn() }) }));
import { initialState } from '@/store/AppContext';
import ManageTab from './ManageTab';
afterEach(cleanup);
it('교사는 학생·보호자 연락처를 구별해 전화할 수 있고 미등록 값은 전화 링크로 만들지 않는다', () => {
  fixture.state = { ...initialState, userRole: { role: 'teacher', part: '1', grade: '1', class: '1' }, classData: { '1-1-1': { students: [
    { id: 'a', name: '합성학생', phone: '010-0000-0001', pphone: '+82 10-0000-0002', addr: '합성 주소' },
    { id: 'b', name: '미등록학생', phone: '', pphone: '미등록' },
  ] } } };
  render(<ManageTab />);
  expect(screen.getByRole('link', { name: '합성학생 학생에게 전화 010-0000-0001' }).getAttribute('href')).toBe('tel:01000000001');
  expect(screen.getByRole('link', { name: '합성학생 보호자에게 전화 +82 10-0000-0002' }).getAttribute('href')).toBe('tel:+821000000002');
  expect(screen.getAllByRole('link')).toHaveLength(2);
  expect(screen.getAllByRole('rowheader', { name: '보호자 연락처' })).toHaveLength(2);
  expect(screen.getByText('합성 주소')).toBeTruthy();
  expect(screen.queryByRole('button', { name: '수정' })).toBeNull();
});
