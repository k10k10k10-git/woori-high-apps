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
  it('이미 다른 반에 등록된 동일인과 다른 PID의 이름·생일 일치도 새 반 진급 전에 중단한다', () => {
    for (const samePersonId of [true, false]) {
      const input = snapshot();
      input.classes[2025]['1-1-1'].students!.s = { ...student, birth: '2010. 01. 02' };
      input.classes[2026] = { '2-2-6': { students: { other: { ...student, id: 'other', birth: '2010-01-02', personId: samePersonId ? student.personId : 'person_student_other' } } } };
      const before = structuredClone(input);
      expect(() => buildPromotionPayload(input, false, 'operation')).toThrow('2부 2학년 6반');
      expect(input).toEqual(before);
    }
  });
  it('기존 반을 교체할 때 같은 학생을 다른 SID로 다시 만드는 것을 중단한다', () => {
    const input = snapshot();
    input.classes[2026] = { '1-2-1': { students: { other: { ...student, id: 'other' } } } };
    expect(() => buildPromotionPayload(input, true, 'operation')).toThrow('동일 학생');
  });
  it('이전 명단의 같은 학생이 서로 다른 진급 반에 중복되면 묶음 전체를 중단한다', () => {
    const input = snapshot();
    input.classes[2025]['2-1-6'] = { students: { other: { ...student, id: 'other' } } };
    const before = structuredClone(input);
    expect(() => buildPromotionPayload(input, false, 'operation')).toThrow('동일 학생');
    expect(input).toEqual(before);
  });
  it('진급 묶음의 같은 반 안에서도 별도 PID의 이름·본인 전화 중복을 차단한다', () => {
    const input = snapshot();
    input.classes[2025]['1-1-1'].students = {
      s: { ...student, phone: '01012345678' },
      other: { ...student, id: 'other', phone: '010-1234-5678', personId: 'person_student_other' },
    };
    expect(() => buildPromotionPayload(input, false, 'operation')).toThrow('동일 학생');
  });
  it('동명이인의 다른 생일과 기존의 무관한 중복은 정상 진급을 막지 않는다', () => {
    const input = snapshot();
    input.classes[2025]['1-1-1'].students!.s = { ...student, birth: '2010-01-02' };
    input.classes[2026] = {
      '2-2-6': { students: { other: { ...student, id: 'other', birth: '2010-01-03', personId: 'person_student_other' } } },
      '2-3-1': { students: { a: { id: 'a', name: '다른 중복', personId: 'person_student_duplicate' } } },
      '2-3-2': { students: { b: { id: 'b', name: '다른 중복', personId: 'person_student_duplicate' } } },
    };
    const before = structuredClone(input), result = buildPromotionPayload(input, false, 'operation');
    expect(result.count).toBe(1);
    expect(input).toEqual(before);
    expect(Object.keys(result.payload).some(key => key.startsWith('attendance/'))).toBe(false);
  });
  it('현재 대상 학생의 SID·PID가 같고 이미 있던 중복이면 명시 교체의 복사 계약을 유지한다', () => {
    const input = snapshot();
    input.classes[2026] = {
      '1-2-1': { students: { s: { ...student, jang: true, num: 9 } } },
      '2-2-6': { students: { other: { ...student, id: 'other' } } },
    };
    const before = structuredClone(input), result = buildPromotionPayload(input, true, 'operation');
    expect(result.payload['classes/2026/1-2-1/students']).toEqual({ s: student });
    expect(Object.entries(result.payload).find(([key]) => key.startsWith('trash/'))?.[1]).toMatchObject(input.classes[2026]['1-2-1']);
    expect(input).toEqual(before);
  });
});
