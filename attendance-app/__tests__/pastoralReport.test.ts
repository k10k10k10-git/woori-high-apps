import { describe, expect, it } from 'vitest';
import { buildPastoralReport, reportDate, settlementStartDate, type ReportFriend } from '@/utils/pastoralReport';
import type { AdminDashboardSource } from '@/utils/adminDashboard';

const now = Date.parse('2026-02-02T00:00:00+09:00');
const base: AdminDashboardSource = { curYear: 2026, months: [{ month: 1, sundays: [4, 11, 18, 25] }, { month: 2, sundays: [1] }], events: {},
  classData: { '1-1-1': { teacher: '담임', students: [{ id: 'nf_one', name: '가상학생', personId: 'p1' }] } },
  attData: { '1-1-1': { nf_one: { '0-0': 'O', '0-1': 'X', '0-2': 'X', '0-3': 'X', '1-0': 'X' } } } };
const friend: ReportFriend = { key: '2026-1/f1', name: '가상학생', part: '1', grade: '1', registeredDate: '2026-01-01', rosterSync: { studentId: 'nf_one', classKey: '1-1-1', personId: 'p1', syncedAt: '2026-01-10T01:00:00Z' } };
describe('목양 리포트', () => {
  it('3회 이상 실제 결석만 집계하고 마지막 출석을 보존한다', () => {
    const report = buildPastoralReport(base, [], now);
    expect(report.absent[0].streak).toBe(4);
    expect(report.absent[0].lastPresent?.label).toBe('1월 4일');
  });
  it('미입력에서 연속 계산을 멈춘다', () => {
    const source = structuredClone(base); delete source.attData['1-1-1'].nf_one['0-3'];
    expect(buildPastoralReport(source, [], now).absent).toHaveLength(0);
  });
  it('행사 주일은 제외하고 미래 주일은 계산하지 않는다', () => {
    const source = structuredClone(base); source.events['0-3'] = '행사';
    expect(buildPastoralReport(source, [], now).absent[0].streak).toBe(3);
    expect(buildPastoralReport(base, [], Date.parse('2026-01-24T23:59:00+09:00')).absent).toHaveLength(0);
  });
  it('기준일 이전 기록만으로 회복을 판정한다', () => {
    const source = structuredClone(base); source.attData['1-1-1'].nf_one['1-0'] = 'O';
    expect(buildPastoralReport(source, [], now).recovered).toHaveLength(1);
    expect(buildPastoralReport(source, [], now, '0-3').recovered).toHaveLength(0);
  });
  it('등반 전 출석은 첫 4회와 8회에 포함하지 않는다', () => {
    const report = buildPastoralReport(base, [friend], now);
    expect(report.settlement).toHaveLength(1);
    expect(report.settlement[0].four).toEqual({ elapsed: 4, present: 0, missing: 0 });
    expect(report.settlement[0].status).toBe('연락 필요');
  });
  it('등반 완료 근거가 없으면 nf_ 명단도 추정 포함하지 않는다', () => {
    expect(buildPastoralReport(base, [], now).settlement).toHaveLength(0);
    expect(buildPastoralReport(base, [{ ...friend, rosterSync: undefined, decision: '등록' }], now).settlement).toHaveLength(0);
    expect(reportDate('2026-02-30')).toBeNull();
  });
  it('완료 기록은 있지만 등반일이 없으면 접수일로 대체하지 않는다', () => {
    const result = buildPastoralReport(base, [{ ...friend, rosterSync: { ...friend.rosterSync!, syncedAt: undefined } }], now).settlement[0];
    expect(result.status).toBe('등반일 확인 필요');
    expect(result.four.elapsed).toBe(0);
  });
  it('과거 등반 기록은 유지하고 취소·미완료 학생은 제외한다', () => {
    const legacy = { ...friend, key: 'legacy', rosterSync: undefined, giftDate: '2026-01-11' };
    expect(buildPastoralReport(base, [legacy], now).settlement[0].startedDate).toBe('2026-01-11');
    expect(buildPastoralReport(base, [{ ...legacy, giftDate: undefined }], now).settlement).toHaveLength(0);
  });
  it('등반일의 KST 경계와 과거 기준 주일·미래 등반을 지킨다', () => {
    expect(settlementStartDate({ ...friend, rosterSync: { ...friend.rosterSync!, syncedAt: '2026-01-10T16:00:00Z' } })).toBe('2026-01-11');
    expect(settlementStartDate({ ...friend, rosterSync: { ...friend.rosterSync!, syncedAt: '2026-02-30T00:00:00Z' } })).toBeUndefined();
    expect(buildPastoralReport(base, [friend], now, '0-0').settlement).toHaveLength(0);
    expect(buildPastoralReport(base, [{ ...friend, giftDate: '2026-02-08' }], now).settlement).toHaveLength(0);
  });
  it('반 이동 후 유일한 인물 ID로 연결하고 동명이인·중복 ID는 연결하지 않는다', () => {
    const moved = { ...friend, rosterSync: { ...friend.rosterSync!, classKey: '2-1-1' } };
    expect(buildPastoralReport(base, [moved], now).settlement[0].row?.key).toBe('1-1-1/nf_one');
    const source = structuredClone(base); source.classData['1-1-2'] = structuredClone(base.classData['1-1-1']);
    expect(buildPastoralReport(source, [moved], now).settlement[0].row).toBeUndefined();
    expect(buildPastoralReport(base, [{ ...friend, rosterSync: undefined, giftDate: '2026-01-10' }], now).settlement[0].row).toBeUndefined();
  });
  it('지난 주일이 없는 연도에는 명단을 결석자로 만들지 않는다', () => {
    expect(buildPastoralReport(base, [], Date.parse('2025-01-01')).absent).toHaveLength(0);
  });
});
