import { describe, expect, it } from 'vitest';
import { buildPromotionPayload, type PromotionSnapshot } from '@/lib/promotion';

const student = { id: 's', personId: 'person_student_a', name: '합성 학생' };
const snapshot = (): PromotionSnapshot => ({ year: 2026, classes: { 2025: { '1-1-1': { students: { s: student } } } }, attendance: {} });
describe('진급 원장 보호', () => {
  it('미리보기 명단을 사용하고 현재 연도 출석은 쓰지 않는다', () => {
    const result = buildPromotionPayload(snapshot(), false, 'operation');
    expect(result.classKeys).toEqual(['1-2-1']);
    expect(result.payload['classes/2026/1-2-1/students']).toEqual({ s: student });
    expect(Object.keys(result.payload).some(key => key.startsWith('attendance/'))).toBe(false);
  });
  it('덮어쓰기 미선택은 기존 반을 건너뛰고 명시 교체는 복구 사본을 함께 보낸다', () => {
    const input = snapshot();
    input.classes[2026] = { '1-2-1': { teacher: '담임', students: { other: { id: 'other', name: '다른 학생' } } } };
    expect(() => buildPromotionPayload(input, false, 'operation')).toThrow('빈 반');
    const result = buildPromotionPayload(input, true, 'operation');
    const backup = Object.entries(result.payload).find(([key]) => key.startsWith('trash/'))?.[1];
    expect(backup).toMatchObject(input.classes[2026]['1-2-1']);
  });
  it('기존 학생 또는 보관 출석의 같은 SID가 다른 인물이면 명시 교체도 중단한다', () => {
    const input = snapshot();
    input.classes[2026] = { '1-2-1': { students: { s: { ...student, personId: 'person_student_b' } } } };
    expect(() => buildPromotionPayload(input, true, 'operation')).toThrow('겹칩니다');
    input.classes[2026] = {};
    input.attendance = { '1-2-1': { s: { '0906': 'O' } } };
    expect(() => buildPromotionPayload(input, true, 'operation')).toThrow('겹칩니다');
  });
});
