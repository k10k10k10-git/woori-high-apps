/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState } from '@/store/AppContext';
import type { PublicReportFriend } from '@/lib/pastoralFriendProgress';
const mocks = vi.hoisted(() => ({ query: '', state: {} as typeof initialState, demo: false, receive: (() => {}) as (friends: PublicReportFriend[]) => void, fail: (() => {}) as (error: Error) => void, stop: vi.fn(), subscribe: vi.fn(), remarks: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mocks.query) }));
vi.mock('@/store/AppContext', async original => ({ ...await original<typeof import('@/store/AppContext')>(), useApp: () => ({ state: mocks.state, getState: () => mocks.state }) }));
vi.mock('@/lib/firebase/client', () => ({ auth: { currentUser: { uid: 'synthetic-admin', email: 'synthetic@example.test' } } }));
vi.mock('@/lib/demo', () => ({ isDemoAccount: () => mocks.demo }));
vi.mock('@/lib/pastoralFriends', () => ({ subscribeReportFriends: (...args: unknown[]) => mocks.subscribe(...args) }));
vi.mock('@/lib/newFriendRemarks', () => ({ REMARK_LIMIT: 10000, saveFriendRemark: vi.fn(), subscribeFriendRemark: (...args: unknown[]) => mocks.remarks(...args) }));
vi.mock('@/components/tabs/overall/VisitRequestsSection', () => ({ default: ({ requestKey }: { requestKey?: string }) => <section data-testid="visit-section" data-request-key={requestKey}><h2>심방 요청</h2></section> }));
vi.mock('@/components/tabs/overall/SuggestionsSection', () => ({ default: () => <section><h2>특이사항</h2></section> }));
import PastoralReport from './PastoralReport';
import { clearAdminViewState } from '@/hooks/useAdminViewState';
beforeEach(() => {
  clearAdminViewState();
  mocks.query = ''; mocks.demo = false; mocks.stop.mockClear(); mocks.subscribe.mockReset();
  mocks.state = { ...initialState, curYear: 2026, userRole: { role: 'admin' }, months: [{ month: 1, sundays: [4, 11, 18, 25] }], events: {}, classData: { '1-1-1': { students: [{ id: 'nf_one', name: '합성 학생', phone: '010-0000-0000' }] } }, attData: { '1-1-1': { nf_one: { '0-0': 'O', '0-1': 'X', '0-2': 'X', '0-3': 'X' } } } };
  mocks.subscribe.mockImplementation((_year, receive, fail) => { mocks.receive = receive; mocks.fail = fail; return mocks.stop; });
  mocks.remarks.mockReset(); mocks.remarks.mockImplementation((_key, receive) => { receive({ status: 'ready', value: '합성 기존 비고' }); return mocks.stop; });
});
afterEach(cleanup);
describe('목양 리포트 실제 화면', () => {
  it('심방 요청·특이사항·연속 결석·새친구를 같은 탭 그룹의 순서대로 제공한다', () => {
    render(<PastoralReport />);
    const navigation = screen.getByRole('group', { name: '목양 관리 보기 선택' });
    const tabs = within(navigation).getAllByRole('button');
    expect(tabs.map(tab => tab.textContent)).toEqual(['심방 요청', '특이사항', '연속 결석', '새친구']);
    expect(navigation.querySelector('.pr-secondary-link')).toBeNull();
    fireEvent.click(tabs[1]);
    expect(tabs[1].getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('heading', { name: '특이사항' })).toBeTruthy();
    expect(screen.queryByRole('searchbox')).toBeNull();
    fireEvent.click(tabs[3]);
    expect(within(screen.getByRole('group', { name: '새친구 보기 선택' })).getAllByRole('button').map(tab => tab.textContent)).toEqual(['새친구 등록현황', '새친구 부서정착']);
  });
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
  it('연속 결석 상세를 닫으면 열었던 학생 버튼으로 초점을 돌린다', () => {
    render(<PastoralReport />);
    fireEvent.click(screen.getByRole('button', { name: '연속 결석' }));
    const trigger = screen.getByRole('button', { name: '합성 학생 상세 보기' });
    trigger.focus(); fireEvent.click(trigger);
    expect(screen.getByRole('complementary', { name: '합성 학생 상세' })).toBe(document.activeElement);
    fireEvent.click(screen.getByRole('button', { name: '상세 닫기' }));
    expect(document.activeElement).toBe(trigger);
  });
  it('학생 직접 링크의 대상이 현재 명단에 없으면 이유를 안내한다', () => {
    mocks.query = 'view=absence&student=1-1-1%2Fmissing';
    render(<PastoralReport />);
    expect(screen.getByText(/요청한 학생이 현재 연속 결석 명단에 없습니다/)).toBeTruthy();
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
  it('목양 탭·정렬·검색·학생 상세를 메뉴 왕복에서 복원하고 새 직접 링크를 우선한다', () => {
    const first = render(<PastoralReport />);
    fireEvent.click(screen.getByRole('button', { name: /^연속 결석$/ }));
    fireEvent.change(screen.getByLabelText('정렬'), { target: { value: 'latest' } });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '합성' } });
    fireEvent.click(screen.getByRole('button', { name: '합성 학생 상세 보기' }));
    first.unmount();
    const next = render(<PastoralReport />);
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('합성');
    expect((screen.getByLabelText('정렬') as HTMLSelectElement).value).toBe('latest');
    expect(screen.getByRole('complementary', { name: '합성 학생 상세' })).toBeTruthy();
    mocks.query = 'view=visits&request=1-1-1%2Fnew';
    next.rerender(<PastoralReport />);
    expect(screen.getByTestId('visit-section').getAttribute('data-request-key')).toBe('1-1-1/new');
  });
  it('새 심방 직접 링크는 복원된 다른 부서·학년·검색 필터에 가리지 않는다', () => {
    mocks.state = { ...mocks.state, classData: { ...mocks.state.classData, '2-3-1': { students: [] } } };
    const { rerender } = render(<PastoralReport />);
    fireEvent.change(screen.getByLabelText('부서'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('학년'), { target: { value: '3' } });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '다른 학생' } });
    mocks.query = 'view=visits&request=1-1-1%2Fopen';
    rerender(<PastoralReport />);
    expect((screen.getByLabelText('부서') as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText('학년') as HTMLSelectElement).value).toBe('');
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
    expect(screen.getByTestId('visit-section').getAttribute('data-request-key')).toBe('1-1-1/open');
  });
  it('일반 학생 직접 링크는 이전 장결 필터 때문에 숨지 않는다', () => {
    const { rerender } = render(<PastoralReport />);
    fireEvent.click(screen.getByRole('button', { name: /^연속 결석$/ }));
    fireEvent.change(screen.getByLabelText('장결'), { target: { value: 'long' } });
    mocks.query = 'view=absence&week=0-3&student=1-1-1%2Fnf_one';
    rerender(<PastoralReport />);
    expect((screen.getByLabelText('장결') as HTMLSelectElement).value).toBe('all');
    expect(screen.getByRole('complementary', { name: '합성 학생 상세' })).toBeTruthy();
  });
  it('직접 링크 뒤 수동 탭 선택을 URL에 반영해 새로고침에서도 되돌리지 않는다', () => {
    window.history.replaceState({}, '', '/pastoral?view=visits&request=1-1-1%2Fopen');
    mocks.query = window.location.search.slice(1);
    const first = render(<PastoralReport />);
    fireEvent.click(screen.getByRole('button', { name: /^연속 결석$/ }));
    expect(new URLSearchParams(window.location.search).get('view')).toBe('absence');
    expect(new URLSearchParams(window.location.search).has('request')).toBe(false);
    first.unmount();
    mocks.query = window.location.search.slice(1);
    render(<PastoralReport />);
    expect(screen.getByRole('button', { name: /^연속 결석$/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByText(/요청한 학생이 현재 연속 결석 명단에 없습니다/)).toBeNull();
    window.history.replaceState({}, '', '/');
  });
  it('권한 오류를 0명으로 숨기지 않고 재시도하며 해제된 응답을 무시한다', () => {
    const { rerender } = render(<PastoralReport />);
    act(() => mocks.fail(new Error('권한 없음')));
    fireEvent.click(screen.getByRole('button', { name: '새친구' }));
    fireEvent.click(screen.getByRole('button', { name: '새친구 부서정착' }));
    expect(screen.getByRole('alert').textContent).toContain('명단을 표시하지 않습니다');
    expect(screen.queryByRole('table', { name: '등반 완료 새친구 부서정착 현황' })).toBeNull();
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
    fireEvent.click(screen.getByRole('button', { name: '새친구' }));
    fireEvent.click(screen.getByRole('button', { name: '새친구 부서정착' }));
    expect(screen.getByText('등반 완료 학생')).toBeTruthy();
    expect(screen.queryByText('등반 대기 학생')).toBeNull();
    expect(screen.getByText('2026-01-10')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '등반 완료 학생' }));
    expect(screen.getByText('기록 없음')).toBeTruthy();
    const trigger = screen.getByRole('button', { name: '등반 완료 학생' });
    expect(document.activeElement?.textContent).toBe('닫기');
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(document.activeElement).toBe(trigger);
  });
  it('등록현황은 통합사이트 공개 진행 기록을 실시간 갱신하고 부서정착과 구분한다', () => {
    render(<PastoralReport />);
    fireEvent.click(screen.getByRole('button', { name: '새친구' }));
    fireEvent.click(screen.getByRole('button', { name: '새친구 등록현황' }));
    expect(screen.getByRole('status').textContent).toContain('불러오고 있습니다');
    expect(screen.queryByLabelText('기준 주일')).toBeNull();
    act(() => mocks.receive([
      { key: '2026-sunday/a', name: '등록 대기 학생', part: '1', grade: '1', school: '합성학교', owner: '담당 교사', registeredDate: '2026-01-12', createdAt: '2026-01-12T00:00:00Z', decision: '미정', week1Date: '2026-01-12' },
      { key: '2026-1/b', name: '등반 완료 학생', part: '1', grade: '1', decision: '등록', createdAt: '2026-01-11T00:00:00Z', rosterSync: { studentId: 'nf_one', classKey: '1-1-1', syncedAt: '2026-01-10T00:00:00Z' } },
    ]));
    const table = screen.getByRole('table', { name: /통합사이트 새친구 등록일/ });
    expect(within(table).getByRole('columnheader', { name: '비고' })).toBeTruthy();
    expect(within(table).getAllByText('합성 기존 비고')).toHaveLength(2);
    expect(mocks.remarks).toHaveBeenCalledTimes(2); // PC·모바일 목록은 같은 구독 결과를 공유한다.
    expect(within(table).getByText('등록 대기 학생')).toBeTruthy();
    expect(within(table).getByText('등반 완료 학생')).toBeTruthy();
    expect(within(table).getByText('합성학교')).toBeTruthy();
    expect(within(table).getByText('담당 교사')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('전체 2명');
    const stageSummary = screen.getByRole('group', { name: '새친구 진행 단계별 학생 보기' });
    expect(within(stageSummary).getAllByRole('button').length).toBe(8);
    expect([...stageSummary.querySelectorAll('strong')].reduce((sum, node) => sum + Number(node.textContent?.replace('명', '')), 0)).toBe(2);
    expect(screen.getAllByRole('searchbox').length).toBe(1);
    fireEvent.change(screen.getByRole('searchbox', { name: '새친구 검색' }), { target: { value: '등록대기학생' } });
    expect(within(table).getByText('등록 대기 학생')).toBeTruthy();
    expect(within(table).queryByText('등반 완료 학생')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '초기화' }));
    act(() => mocks.receive([{ key: '2026-sunday/a', name: '등록 대기 학생', part: '1', grade: '1', decision: '등록', week1Date: '2026-01-12', week2Date: '2026-01-19', assignedClassKey: '1-1-1' }]));
    expect(within(table).queryByText('등반 완료 학생')).toBeNull();
    expect(within(table).getByText('관리자 확인 대기')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '새친구' }));
    fireEvent.click(screen.getByRole('button', { name: '새친구 부서정착' }));
    expect(screen.queryByText('등록 대기 학생')).toBeNull();
  });
  it('등록현황은 이름 검색과 단계별 명단 선택을 제공하고 과거 완료를 출석부 반영으로 오인하지 않는다', () => {
    render(<PastoralReport />);
    fireEvent.click(screen.getByRole('button', { name: '새친구' }));
    fireEvent.click(screen.getByRole('button', { name: '새친구 등록현황' }));
    act(() => mocks.receive([
      { key: '2026-1/a', name: '김 하나', part: '1', grade: '1' },
      { key: '2026-1/b', name: '박 둘', part: '1', grade: '1', week1Date: '2026-09-06' },
      { key: '2026-1/c', name: '이 보류', part: '1', grade: '1', decision: '보류' },
      { key: '2026-1/d', name: '최 과거', part: '1', grade: '1', giftDate: '2026-09-13' },
      { key: '2026-1/e', name: '정 반영', part: '1', grade: '1', rosterSync: { studentId: 'nf_e', classKey: '1-1-1' } },
      { key: '2026-1/f', name: '한 종료', part: '1', grade: '1', decision: '미등록' },
    ]));
    const table = screen.getByRole('table', { name: /통합사이트 새친구 등록일/ });
    const summary = screen.getByRole('group', { name: '새친구 진행 단계별 학생 보기' });
    expect(within(table).getAllByRole('row').length).toBe(7);
    expect(within(table).getByRole('row', { name: /최 과거/ }).textContent).toContain('연결 확인 필요');
    expect(within(table).getByRole('row', { name: /정 반영/ }).textContent).toContain('반영 완료');
    expect(within(summary).getByRole('button', { name: /종료\s+1\s*명/ })).toBeTruthy();
    const secondWeek = within(summary).getByRole('button', { name: /2주차\s+1\s*명/ });
    fireEvent.click(secondWeek);
    expect(secondWeek.getAttribute('aria-pressed')).toBe('true');
    expect(within(table).getAllByRole('row').length).toBe(2);
    expect(within(table).getByText('박 둘')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '초기화' }));
    expect(secondWeek.getAttribute('aria-pressed')).toBe('false');
    expect(within(table).getAllByRole('row').length).toBe(7);
    fireEvent.click(secondWeek);
    fireEvent.click(screen.getByRole('button', { name: '전체 단계 보기' }));
    expect(within(table).getAllByRole('row').length).toBe(7);
    fireEvent.click(within(summary).getByRole('button', { name: /2주차\s+1\s*명/ }));
    fireEvent.click(screen.getByRole('button', { name: '새친구' }));
    fireEvent.click(screen.getByRole('button', { name: '새친구 부서정착' }));
    fireEvent.click(screen.getByRole('button', { name: '새친구' }));
    fireEvent.click(screen.getByRole('button', { name: '새친구 등록현황' }));
    expect(within(screen.getByRole('group', { name: '새친구 진행 단계별 학생 보기' })).getByRole('button', { name: /2주차\s+1\s*명/ }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.change(screen.getByRole('searchbox', { name: '새친구 검색' }), { target: { value: '김하나' } });
    const restoredTable = screen.getByRole('table', { name: /통합사이트 새친구 등록일/ });
    expect(within(restoredTable).getAllByRole('row').length).toBe(2);
    expect(within(restoredTable).getByText('김 하나')).toBeTruthy();
    expect(within(screen.getByRole('group', { name: '새친구 진행 단계별 학생 보기' })).getByRole('button', { name: /1주차\s+1\s*명/ })).toBeTruthy();
  });
  it('등록현황 읽기 오류는 빈 명단으로 위장하지 않고 재시도한다', () => {
    render(<PastoralReport />);
    fireEvent.click(screen.getByRole('button', { name: '새친구' }));
    fireEvent.click(screen.getByRole('button', { name: '새친구 등록현황' }));
    act(() => mocks.fail(new Error('권한 없음')));
    expect(screen.getByRole('alert').textContent).toContain('명단과 집계를 표시하지 않습니다');
    expect(screen.queryByRole('table', { name: /통합사이트 새친구 등록일/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(mocks.subscribe).toHaveBeenCalledTimes(2);
  });
  it('부서정착에서 선택한 반 필터를 등록현황의 숨은 적용 필터로 표시하지 않는다', () => {
    render(<PastoralReport />);
    act(() => mocks.receive([{ key: '2026-sunday/a', name: '등록 학생', part: '1', grade: '1', decision: '미정' }]));
    fireEvent.click(screen.getByRole('button', { name: '새친구' }));
    fireEvent.click(screen.getByRole('button', { name: '새친구 부서정착' }));
    fireEvent.change(screen.getByLabelText('반'), { target: { value: '1-1-1' } });
    fireEvent.click(screen.getByRole('button', { name: '새친구' }));
    fireEvent.click(screen.getByRole('button', { name: '새친구 등록현황' }));
    expect(screen.getByRole('button', { name: '필터 더보기' })).toBeTruthy();
    expect(within(screen.getByRole('table', { name: /통합사이트 새친구 등록일/ })).getByText('등록 학생')).toBeTruthy();
  });
  it('탭을 전환해도 연속 결석 정렬 선택을 유지한다', () => {
    render(<PastoralReport />);
    fireEvent.click(screen.getByRole('button', { name: '연속 결석' }));
    fireEvent.change(screen.getByLabelText('정렬'), { target: { value: 'latest' } });
    fireEvent.click(screen.getByRole('button', { name: '새친구' }));
    fireEvent.click(screen.getByRole('button', { name: '새친구 부서정착' }));
    fireEvent.click(screen.getByRole('button', { name: '연속 결석' }));
    expect((screen.getByLabelText('정렬') as HTMLSelectElement).value).toBe('latest');
  });
  it('연속 결석 후 다시 출석한 학생을 같은 탭에서 확인한다', () => {
    mocks.state = { ...mocks.state, attData: { '1-1-1': { nf_one: { '0-0': 'X', '0-1': 'X', '0-2': 'X', '0-3': 'O' } } } };
    render(<PastoralReport />);
    fireEvent.click(screen.getByRole('button', { name: '연속 결석' }));
    fireEvent.click(within(screen.getByRole('group', { name: '결석 상태' })).getByRole('button', { name: /다시 출석/ }));
    expect(screen.getByText('3회 이상 결석 후 출석')).toBeTruthy();
  });
  it.each(['teacher', 'demo'])('%s는 새친구를 구독하거나 연락처를 표시하지 않는다', mode => {
    if (mode === 'teacher') mocks.state = { ...mocks.state, userRole: { role: 'teacher' } };
    else mocks.demo = true;
    render(<PastoralReport />);
    expect(mocks.subscribe).not.toHaveBeenCalled();
    expect(mocks.remarks).not.toHaveBeenCalled();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
