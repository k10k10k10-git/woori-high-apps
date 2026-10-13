import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { adminStatusTone } from './adminStatus';

function luminance(hex: string) {
  const channels = hex.replace('#', '').match(/../g)!.map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(first: string, second: string) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe('관리자 업무 상태 표시', () => {
  it.each([
    ['연락 필요', 'danger'], ['출석 입력 확인', 'warning'], ['출석 흐름 확인', 'info'],
    ['초기 4주 출석 양호', 'success'], ['관찰 기간 부족', 'neutral'],
    ['등반일 확인 필요', 'warning'], ['출석부 연결 확인', 'warning'], ['관찰 중', 'info'],
    ['미입력', 'warning'], ['입력 중', 'info'], ['입력 완료', 'success'],
    ['확인 필요', 'warning'], ['처리 완료', 'success'], ['저장 중', 'info'],
    ['1주차', 'info'], ['2주차', 'info'], ['등록 결정', 'warning'], ['반배정', 'warning'],
    ['출석부 반영', 'warning'], ['완료', 'success'], ['반영 완료', 'success'],
    ['보류', 'neutral'], ['종료', 'neutral'], ['준비 필요', 'warning'], ['미정', 'warning'],
    ['관리자 확인 대기', 'warning'], ['학생 연결 확인 필요', 'warning'], ['이미 명단 있음', 'warning'],
    ['일반', 'neutral'], ['일반 학생', 'neutral'], ['장결', 'neutral'], ['장결 학생', 'neutral'],
    ['출석 대상 없음', 'neutral'], ['조회 주일 없음', 'neutral'], ['학생 없음', 'neutral'],
    ['A', 'success'], ['B', 'info'], ['C', 'warning'], ['D', 'danger'],
    ['—', 'neutral'], ['산정 불가', 'neutral'], ['알 수 없는 상태', 'neutral'], ['constructor', 'neutral'],
  ])('%s의 의미를 %s 색상으로 구분한다', (label, tone) => expect(adminStatusTone(label)).toBe(tone));

  it.each(['danger', 'warning', 'info', 'success', 'neutral'])('%s 배지의 글자·아이콘 대비와 테두리 대비를 보장한다', tone => {
    const css = readFileSync(new URL('../components/admin/admin-status.css', import.meta.url), 'utf8');
    const palette = css.match(new RegExp(`\\[data-status-tone="${tone}"\\]\\{([^}]+)\\}`))![1];
    const token = (name: string) => palette.match(new RegExp(`--status-${name}:(#[0-9a-f]{6})`))![1];
    expect(contrast(token('ink'), token('surface'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('edge'), token('surface'))).toBeGreaterThanOrEqual(3);
    expect(contrast('#6355a7', token('surface'))).toBeGreaterThanOrEqual(3);
  });
});
