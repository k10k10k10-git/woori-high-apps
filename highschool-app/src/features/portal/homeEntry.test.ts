import { expect, it } from 'vitest';
import { buildHomeEntry } from './homeEntry';
import type { HomeAction } from './homeActions';
const scheduled: HomeAction = { id:'a', date:'2026-09-08', title:'학기 모임', kind:'semester', meta:'', href:'/semester/current', urgency:'upcoming', dayLabel:'D-7' };
it('찬양팀은 다음 일반 일정보다 담당 팀을 먼저 연다', () => {
  expect(buildHomeEntry({roles:{semester:'praise',retreat:'none'},actions:[scheduled],semesterId:'current',fieldActive:false})?.href).toBe('/teams/praise');
});
it('현장 권한과 실제 진행 기간이 모두 있을 때만 큐카드를 추천한다', () => {
  const input = {roles:{semester:'praise' as const,retreat:'fieldStaff' as const},actions:[],retreat:{id:'r',name:'여름'},fieldActive:false};
  expect(buildHomeEntry(input)?.href).toBe('/teams/praise');
  expect(buildHomeEntry({...input,fieldActive:true})?.href).toBe('/events/r/field?view=cue');
});
it('일정 데이터가 있어도 열 수 없는 영역은 추천하지 않는다', () => {
  expect(buildHomeEntry({roles:{semester:'none',retreat:'fieldStaff'},actions:[{...scheduled,urgency:'today'}],fieldActive:false})?.href).toBe('/events');
  expect(buildHomeEntry({roles:{semester:'none',retreat:'none'},actions:[scheduled],fieldActive:false})).toBeNull();
});
it('학기 관리자와 기간 미등록 현장 담당자의 다음 행동을 제공한다', () => {
  expect(buildHomeEntry({roles:{semester:'superAdmin',retreat:'none'},actions:[],semesterId:'학기/1',fieldActive:false})?.href).toBe('/operations/semesters/%ED%95%99%EA%B8%B0%2F1/overview');
  expect(buildHomeEntry({roles:{semester:'none',retreat:'fieldStaff'},actions:[],fieldActive:false})?.steps).toHaveLength(3);
});
it('팀별 첫 사용 안내는 실제 담당 업무를 가리킨다', () => {
  expect(buildHomeEntry({roles:{semester:'barnabas',retreat:'none'},actions:[],fieldActive:false})?.steps[0]).toContain('새친구');
  expect(buildHomeEntry({roles:{semester:'praise',retreat:'none'},actions:[],fieldActive:false})?.steps[2]).toContain('등단표');
});
it('여러 팀을 맡은 스탭에게 담당 팀 선택과 첫 사용 안내를 제공한다', () => {
  const entry = buildHomeEntry({ roles: { semester: 'staff', retreat: 'none' }, actions: [], fieldActive: false, assignedTeamKeys: ['praise', 'media'], operationsAllowed: false });
  expect(entry?.href).toBe('/teams');
  expect(entry?.steps[0]).toBe('담당 팀 선택');
  expect(entry?.steps).toHaveLength(3);
});
