/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { initialState } from '@/store/AppContext';
const m = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock('@/store/AppContext', async original => ({ ...await original<typeof import('@/store/AppContext')>(), useApp: () => ({ state: { ...initialState, userRole: { role: 'admin' } }, dispatch: m.dispatch }) }));
vi.mock('@/lib/db', () => ({ db: {}, ref: (_db: unknown, path: string) => path, get: async () => ({ exists: () => false, val: () => null }), set: vi.fn(), update: vi.fn(), runTransaction: vi.fn() }));
vi.mock('@/lib/firebase/client', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('next/dynamic', () => ({ default: () => () => <div>교사 명단 합성 화면</div> }));
vi.mock('./SheetSyncSection', () => ({ default: () => <div>명단 반영 합성 화면</div> }));
import AdminTab from './AdminTab';
afterEach(cleanup);
it('설정을 계정·교사·행사·데이터로 구분하고 교사 화면은 선택할 때만 연다', async () => {
  render(<AdminTab />);
  await screen.findByText('등록된 계정이 없습니다');
  expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['계정 관리', '교사 명단', '출석 제외 일정', '데이터 관리']);
  expect(screen.queryByText('교사 명단 합성 화면')).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: '교사 명단' }));
  expect(screen.getByText('교사 명단 합성 화면')).toBeTruthy();
  expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(screen.getByRole('tab', { name: '교사 명단' }).id);
  fireEvent.keyDown(screen.getByRole('tab', { name: '교사 명단' }), { key: 'ArrowRight' });
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: '출석 제외 일정' }));
  expect(screen.getByRole('tab', { name: '출석 제외 일정' }).getAttribute('aria-selected')).toBe('true');
  expect(screen.queryByText('교사 명단 합성 화면')).toBeNull();
});
it('청년부 인계는 데이터 관리에서 열고 계정 화면에는 노출하지 않는다', async () => {
  render(<AdminTab />);
  await screen.findByText('등록된 계정이 없습니다');
  expect(screen.queryByRole('button', { name: '전체 고3 엑셀 내려받기' })).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: '데이터 관리' }));
  expect(screen.getByRole('button', { name: '전체 고3 엑셀 내려받기' }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('heading', { name: /청년부 인계/ })).toBeTruthy();
});
