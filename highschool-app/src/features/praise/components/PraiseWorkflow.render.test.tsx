/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PraiseGroupBoard } from './PraiseGroupBoard';
import { PraiseGroups } from './PraiseGroups';
import { praiseFixture } from './praiseTestFixtures';
import { confirmPraiseNavigation, usePraiseDraftGuard } from '../usePraiseDraftGuard';
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('검색은 다른 조의 학생도 찾고 선택 학생만 한 번씩 함께 이동한다', () => {
  const view=praiseFixture(), move=vi.fn();
  render(<PraiseGroupBoard groups={view.groups[0].groups} people={view.people} maximum={7} canEdit onMove={move} onRename={vi.fn()} />);
  const students=view.people.filter(p=>p.kind==='STUDENT');
  fireEvent.change(screen.getByRole('searchbox',{name:'학생 찾기'}),{target:{value:students[1].name}});
  expect(screen.queryByText(students[0].name)).toBeNull();
  fireEvent.click(screen.getByRole('checkbox',{name:`${students[1].name} 함께 이동 선택`}));
  fireEvent.change(screen.getByLabelText('이동할 조'),{target:{value:'unassigned'}});
  fireEvent.click(screen.getByRole('button',{name:'선택 학생 이동'}));
  expect(move.mock.calls).toEqual([[students[1].id,'','studentIds']]);
});
it('조회 전용 조편성은 검색을 허용하고 배치 쓰기 제어는 제공하지 않는다', () => {
 const view=praiseFixture();
 render(<PraiseGroupBoard groups={view.groups[0].groups} people={view.people} maximum={7} canEdit={false} onMove={vi.fn()} onRename={vi.fn()} />);
 expect(screen.getByRole('searchbox')).toBeTruthy(); expect(screen.queryByRole('checkbox')).toBeNull();
});
it('저장되지 않은 조를 다른 기록으로 바꾸려다 취소하면 작성 내용을 보존한다', () => {
  const view=praiseFixture(); const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
  render(<PraiseGroups view={view} execute={vi.fn()} busy={false} />);
  const name=screen.getByLabelText(`${view.groups[0].groups[0].name} 이름`);
  fireEvent.change(name,{target:{value:'작성 중인 조'}});
  fireEvent.change(screen.getByLabelText('편성 기록'),{target:{value:''}});
  expect(confirm).toHaveBeenCalledOnce(); expect(screen.getByLabelText('작성 중인 조 이름')).toBeTruthy();
});
it('저장 실패 후에도 수정한 조 이름이 유지된다', async () => {
  const view=praiseFixture(); const execute=vi.fn().mockResolvedValue(false);
  render(<PraiseGroups view={view} execute={execute} busy={false} />);
  fireEvent.change(screen.getByLabelText(`${view.groups[0].groups[0].name} 이름`),{target:{value:'보존할 조'}});
  fireEvent.click(screen.getByRole('button',{name:'현재 초안 저장'}));
  await waitFor(()=>expect(execute).toHaveBeenCalledOnce());
  expect(screen.getByLabelText('보존할 조 이름')).toBeTruthy();
});
it('편집 가드는 브라우저 이탈과 작업 중 이동을 막고 해제 때 정리된다', () => {
  function Draft({dirty,busy}:{dirty:boolean;busy:boolean}) { usePraiseDraftGuard('stage',dirty,busy); return null; }
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false), alert=vi.spyOn(window,'alert').mockImplementation(()=>{});
  const {rerender,unmount}=render(<Draft dirty busy={false}/>);
  expect(confirmPraiseNavigation()).toBe(false); expect(confirm).toHaveBeenCalledOnce();
  const event=new Event('beforeunload',{cancelable:true}); window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
  rerender(<Draft dirty={false} busy/>); expect(confirmPraiseNavigation()).toBe(false); expect(alert).toHaveBeenCalledOnce();
  unmount(); expect(confirmPraiseNavigation()).toBe(true);
});
