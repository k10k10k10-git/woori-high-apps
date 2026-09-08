import { expect, it } from 'vitest';
import { buildHomeEntry } from './homeEntry';
import type { HomeAction } from './homeActions';
const scheduled: HomeAction = { id:'a', date:'2026-09-08', title:'학기 모임', kind:'semester', meta:'', href:'/semester/current', urgency:'upcoming', dayLabel:'D-7' };
it('찬양팀은 다음 일반 일정보다 담당 팀을 먼저 연다', () => {
  expect(buildHomeEntry({roles:{semester:'praise',retreat:'none'},actions:[scheduled],semesterId:'current',fieldActive:false})?.href).toBe('/sunday-ministry/praise');
});
it('현장 권한과 실제 진행 기간이 모두 있을 때만 큐카드를 추천한다', () => {
  const input = {roles:{semester:'praise' as const,retreat:'fieldStaff' as const},actions:[],retreat:{id:'r',name:'여름'},fieldActive:false};
  expect(buildHomeEntry(input)?.href).toBe('/sunday-ministry/praise');
  expect(buildHomeEntry({...input,fieldActive:true})?.href).toBe('/retreat/r/field?view=cue');
});
it('일정 데이터가 있어도 열 수 없는 영역은 추천하지 않는다', () => {
  expect(buildHomeEntry({roles:{semester:'none',retreat:'fieldStaff'},actions:[{...scheduled,urgency:'today'}],fieldActive:false})?.href).toBe('/field');
  expect(buildHomeEntry({roles:{semester:'none',retreat:'none'},actions:[scheduled],fieldActive:false})).toBeNull();
});
it('학기 관리자와 기간 미등록 현장 담당자의 다음 행동을 제공한다', () => {
  expect(buildHomeEntry({roles:{semester:'superAdmin',retreat:'none'},actions:[],semesterId:'학기/1',fieldActive:false})?.href).toBe('/semester/%ED%95%99%EA%B8%B0%2F1');
  expect(buildHomeEntry({roles:{semester:'none',retreat:'fieldStaff'},actions:[],fieldActive:false})?.steps).toHaveLength(3);
});
