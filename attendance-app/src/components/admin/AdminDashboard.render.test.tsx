/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState } from '@/store/AppContext';
import type { OpenVisitRequest } from '@/hooks/useVisitRequests';

const mocks = vi.hoisted(() => ({
  state: null as unknown as typeof initialState,
  dispatch: vi.fn(),
  push: vi.fn(),
  visits: { year: 2026, status: 'ready' as 'ready' | 'loading' | 'error', rows: [] as OpenVisitRequest[] },
}));
vi.mock('@/store/AppContext', async original => ({
  ...await original<typeof import('@/store/AppContext')>(),
  useApp: () => ({ state: mocks.state, dispatch: mocks.dispatch }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/hooks/useVisitRequests', () => ({ useOpenVisitRequests: () => mocks.visits }));

import AdminDashboard from './AdminDashboard';

beforeEach(() => {
  mocks.dispatch.mockClear(); mocks.push.mockClear();
  mocks.visits = { year: 2026, status: 'ready', rows: [{
    classKey: '1-1-1', id: 'visit-1', studentId: 'a', studentName: '심방 학생',
    kind: 'visit', text: '연락 요청', author: '담임', createdAt: 1, status: 'open',
  }] };
  mocks.state = {
    ...initialState,
    curYear: 2026,
    months: [{ month: 1, sundays: [4, 11, 18, 25] }],
    events: {},
    classData: { '1-1-1': { teacher: '담임', students: [
      { id: 'a', name: '연속 결석 학생' }, { id: 'b', name: '출석 학생' },
      { id: 'c', name: '미입력 학생' }, { id: 'd', name: '장결 학생', jang: true },
    ] } },
    attData: { '1-1-1': {
      a: { '0-0': 'O', '0-1': 'X', '0-2': 'X', '0-3': 'X' },
      b: { '0-3': 'O' }, d: { '0-3': 'O' },
    } },
  };
});
afterEach(cleanup);

describe('관리자 오늘 업무', () => {
  it('출석률의 입력 분모와 일반 학생 입력 완료를 구분하고 연간 심방과 주간 현황을 나눈다', () => {
    render(<AdminDashboard />);
    expect(screen.getByRole('heading', { level: 1, name: '오늘 업무' })).toBeTruthy();
    expect(screen.getByRole('group', { name: '2026년 현재 미처리 심방 요청' }).textContent).toContain('1명 심방 요청');
    const week = screen.getByRole('group', { name: '1월 25일 출석 현황' });
    expect(week.textContent).toContain('출석률 67%');
    expect(week.textContent).toContain('O·X 입력 3명 기준');
    expect(week.textContent).toContain('출석 체크 2/3명 완료(장결 제외)');
    expect(screen.getByText(/심방은 2026년 현재 미처리 요청/)).toBeTruthy();
    expect([...document.querySelectorAll('.ad-work-groups > article')].map(card => card.getAttribute('data-status-tone'))).toEqual(['warning', 'danger', 'warning']);
  });

  it('학생별 화살표가 해당 결석 학생과 심방 요청을 직접 연다', () => {
    render(<AdminDashboard />);
    const absentUrl = new URL(screen.getByRole('link', { name: '연속 결석 학생 연속 결석 보기' }).getAttribute('href')!, 'https://example.test');
    expect(absentUrl.searchParams.get('view')).toBe('absence');
    expect(absentUrl.searchParams.get('student')).toBe('1-1-1/a');
    expect(absentUrl.searchParams.get('week')).toBe('0-3');
    const visitUrl = new URL(screen.getByRole('link', { name: '심방 학생 심방 요청 보기' }).getAttribute('href')!, 'https://example.test');
    expect(visitUrl.searchParams.get('view')).toBe('visits');
    expect(visitUrl.searchParams.get('request')).toBe('1-1-1/visit-1');
    expect(visitUrl.searchParams.has('week')).toBe(false);
    const pendingUrl = new URL(screen.getAllByRole('link', { name: '전체 보기' })[2].getAttribute('href')!, 'https://example.test');
    expect(pendingUrl.searchParams.get('status')).toBe('pending');
  });

  it('우선순위를 유지하면서 확인할 일이 없는 카드를 간결한 상태로 표시한다', () => {
    mocks.visits = { year: 2026, status: 'ready', rows: [] };
    mocks.state = { ...mocks.state, attData: { '1-1-1': {
      a: { '0-3': 'O' }, b: { '0-3': 'O' }, c: { '0-3': 'O' },
    } } };
    render(<AdminDashboard />);
    const cards = [...document.querySelectorAll('.ad-work-groups > article')];
    expect(cards.map(card => within(card as HTMLElement).getByRole('heading', { level: 3 }).textContent?.replace(/\s*0$/, ''))).toEqual(['심방 요청', '연속 결석', '출석 미입력']);
    expect(cards.every(card => card.classList.contains('ad-work-idle'))).toBe(true);
    expect(cards.map(card => card.getAttribute('data-status-tone'))).toEqual(['neutral', 'neutral', 'success']);
  });

  it('조회할 주일이 없으면 입력 인원을 0명 완료로 오해시키지 않는다', () => {
    mocks.state = { ...mocks.state, months: [] };
    render(<AdminDashboard />);
    const week = screen.getByRole('group', { name: '조회 주일 없음 출석 현황' });
    expect(week.textContent).toContain('조회할 주일이 없어 입력 인원을 계산하지 않습니다.');
    expect(week.textContent).not.toContain('0/3명 완료');
    expect(document.querySelector('.ad-work-groups > article:last-child')?.getAttribute('data-status-tone')).toBe('neutral');
  });

  it.each([false, true])('입력 대상이 없는 반은 완료의 초록색으로 표시하지 않는다 (장결만: %s)', onlyLong => {
    mocks.state = { ...mocks.state, classData: onlyLong ? { '1-1-1': { students: [{ id: 'long', name: '합성 장결', jang: true }] } } : {} };
    render(<AdminDashboard />);
    expect(document.querySelector('.ad-work-groups > article:last-child')?.getAttribute('data-status-tone')).toBe('neutral');
  });
});
