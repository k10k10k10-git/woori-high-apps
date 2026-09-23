/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState } from '@/store/AppContext';
import type { ReportFriend } from '@/utils/pastoralReport';
const mocks = vi.hoisted(() => ({ query: '', state: {} as typeof initialState, demo: false, receive: (() => {}) as (friends: ReportFriend[]) => void, fail: (() => {}) as (error: Error) => void, stop: vi.fn(), subscribe: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mocks.query) }));
vi.mock('@/store/AppContext', async original => ({ ...await original<typeof import('@/store/AppContext')>(), useApp: () => ({ state: mocks.state }) }));
vi.mock('@/lib/firebase/client', () => ({ auth: { currentUser: { email: 'synthetic@example.test' } } }));
vi.mock('@/lib/demo', () => ({ isDemoAccount: () => mocks.demo }));
vi.mock('@/lib/pastoralFriends', () => ({ subscribeReportFriends: (...args: unknown[]) => mocks.subscribe(...args) }));
vi.mock('@/components/tabs/overall/VisitRequestsSection', () => ({ default: ({ requestKey }: { requestKey?: string }) => <section data-testid="visit-section" data-request-key={requestKey}><h2>심방 요청</h2></section> }));
vi.mock('@/components/tabs/overall/SuggestionsSection', () => ({ default: () => <section><h2>특이사항</h2></section> }));
import PastoralReport from './PastoralReport';
beforeEach(() => {
  mocks.query = ''; mocks.demo = false; mocks.stop.mockClear(); mocks.subscribe.mockReset();
  mocks.state = { ...initialState, curYear: 2026, userRole: { role: 'admin' }, months: [{ month: 1, sundays: [4, 11, 18, 25] }], events: {}, classData: { '1-1-1': { students: [{ id: 'nf_one', name: '합성 학생', phone: '010-0000-0000' }] } }, attData: { '1-1-1': { nf_one: { '0-0': 'O', '0-1': 'X', '0-2': 'X', '0-3': 'X' } } } };
  mocks.subscribe.mockImplementation((_year, receive, fail) => { mocks.receive = receive; mocks.fail = fail; return mocks.stop; });
});
afterEach(cleanup);
describe('목양 리포트 실제 화면', () => {
  it('세부 탭을 전환하고 연락처 연결과 검색을 제공한다', () => {
    render(<PastoralReport />);
    fireEvent.click(screen.getByRole('button', { name: '연속 결석' }));
    fireEvent.click(screen.getByRole('button', { name: '합성 학생' }));
    expect(screen.getByRole('link', { name: '010-0000-0000' }).getAttribute('href')).toBe('tel:01000000000');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '없는 이름' } });
    expect(screen.getByText('이 조건에 해당하는 연속 결석 학생이 없습니다.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '초기화' }));
    fireEvent.click(screen.getByRole('button', { name: '심방 요청' }));
    expect(screen.getByRole('heading', { name: '심방 요청' })).toBeTruthy();
  });
  it('미입력 이후 결석은 확인된 횟수와 중단 지점을 함께 표시한다', () => {
    mocks.state = { ...mocks.state, attData: { '1-1-1': { nf_one: { '0-1': 'X', '0-2': 'X', '0-3': 'X' } } } };
    render(<PastoralReport />);
    fireEvent.click(screen.getByRole('button', { name: '연속 결석' }));
    expect(screen.getByText('3회')).toBeTruthy();
    expect(screen.getByText('이전 미입력 있음')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '합성 학생 상세 보기' }));
    expect(screen.getByText('조회 연도 기록 없음')).toBeTruthy();
  });
  it('학생 직접 링크가 해당 연속 결석 상세를 열고 초점을 옮긴다', () => {
    mocks.query = 'view=absence&week=0-3&student=1-1-1%2Fnf_one';
    render(<PastoralReport />);
    const detail = screen.getByRole('complementary', { name: '합성 학생 상세' });
    expect(detail).toBe(document.activeElement);
    expect(detail.textContent).toContain('010-0000-0000');
  });
  it('학생 직접 링크의 대상이 현재 명단에 없으면 이유를 안내한다', () => {
    mocks.query = 'view=absence&student=1-1-1%2Fmissing';
    render(<PastoralReport />);
    expect(screen.getByRole('status').textContent).toContain('현재 연속 결석 명단에 없습니다');
  });
  it('주소가 바뀔 때만 주일·탭을 동기화하고, 수동 전환 뒤에는 이전 심방 강조를 지운다', () => {
    mocks.query = 'view=visits&request=1-1-1%2Fopen';
    const { rerender } = render(<PastoralReport />);
    expect(screen.getByTestId('visit-section').getAttribute('data-request-key')).toBe('1-1-1/open');
    fireEvent.click(screen.getByRole('button', { name: '연속 결석' }));
    rerender(<PastoralReport />);
    expect(screen.getByRole('button', { name: '연속 결석' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '심방 요청' }));
    expect(screen.getByTestId('visit-section').getAttribute('data-request-key')).toBe('');
    mocks.query = 'view=visits&request=1-1-1%2Fdone';
    rerender(<PastoralReport />);
    expect(screen.getByTestId('visit-section').getAttribute('data-request-key')).toBe('1-1-1/done');

    mocks.query = 'view=absence&week=0-2';
    rerender(<PastoralReport />);
    expect(screen.queryByRole('complementary', { name: '합성 학생 상세' })).toBeNull();
    mocks.query = 'view=absence&week=0-3&student=1-1-1%2Fnf_one';
    rerender(<PastoralReport />);
    expect(screen.getByRole('complementary', { name: '합성 학생 상세' })).toBeTruthy();
  });
  it('권한 오류를 0명으로 숨기지 않고 재시도하며 해제된 응답을 무시한다', () => {
    const { rerender } = render(<PastoralReport />);
    act(() => mocks.fail(new Error('권한 없음')));
    fireEvent.click(screen.getByRole('button', { name: '새친구 정착' }));
    expect(screen.getByRole('alert').textContent).toContain('명단을 표시하지 않습니다');
    expect(screen.queryByText('합성 학생')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(mocks.subscribe).toHaveBeenCalledTimes(2);
    const oldReceive = mocks.receive;
    mocks.state = { ...mocks.state, curYear: 2025, dataRevision: 2 };
    rerender(<PastoralReport />);
    act(() => oldReceive([{ key: 'old', name: '오래된 비공개 이름', part: '1', grade: '1' }]));
    expect(screen.queryByText('오래된 비공개 이름')).toBeNull();
    expect(mocks.stop).toHaveBeenCalled();
  });
  it('등반 완료 학생만 표시하고 등반 이후 기록을 구분한다', () => {
    render(<PastoralReport />);
    act(() => mocks.receive([
      { key: 'done', name: '등반 완료 학생', part: '1', grade: '1', rosterSync: { studentId: 'nf_one', classKey: '1-1-1', syncedAt: '2026-01-10T00:00:00Z' } },
      { key: 'pending', name: '등반 대기 학생', part: '1', grade: '1', decision: '등록', registeredDate: '2026-01-01' },
    ]));
    fireEvent.click(screen.getByRole('button', { name: '새친구 정착' }));
    expect(screen.getByText('등반 완료 학생')).toBeTruthy();
    expect(screen.queryByText('등반 대기 학생')).toBeNull();
    expect(screen.getByText('2026-01-10')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '등반 완료 학생' }));
    expect(screen.getByText('기록 없음')).toBeTruthy();
  });
  it('탭을 전환해도 연속 결석 정렬 선택을 유지한다', () => {
    render(<PastoralReport />);
    fireEvent.click(screen.getByRole('button', { name: '연속 결석' }));
    fireEvent.change(screen.getByLabelText('정렬'), { target: { value: 'latest' } });
    fireEvent.click(screen.getByRole('button', { name: '새친구 정착' }));
    fireEvent.click(screen.getByRole('button', { name: '연속 결석' }));
    expect((screen.getByLabelText('정렬') as HTMLSelectElement).value).toBe('latest');
  });
  it('연속 결석 후 다시 출석한 학생을 같은 탭에서 확인한다', () => {
    mocks.state = { ...mocks.state, attData: { '1-1-1': { nf_one: { '0-0': 'X', '0-1': 'X', '0-2': 'X', '0-3': 'O' } } } };
    render(<PastoralReport />);
    fireEvent.click(screen.getByRole('button', { name: '연속 결석' }));
    fireEvent.click(screen.getByRole('button', { name: /다시 출석/ }));
    expect(screen.getByText('3회 이상 결석 후 출석')).toBeTruthy();
  });
  it.each(['teacher', 'demo'])('%s는 새친구를 구독하거나 연락처를 표시하지 않는다', mode => {
    if (mode === 'teacher') mocks.state = { ...mocks.state, userRole: { role: 'teacher' } };
    else mocks.demo = true;
    render(<PastoralReport />);
    expect(mocks.subscribe).not.toHaveBeenCalled();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
