import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// 이 파일은 Firebase 프로젝트 woori-high의 유일한 배포용 규칙 원천이다.
// 아래 계약은 실제 사고·블로커에서 나온 것이라 규칙을 손볼 때 먼저 깨져야 한다.
const rules = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../database.rules.json'), 'utf-8'),
).rules as Record<string, { '.read'?: string; '.write'?: string }>;

/** 규칙 식이 해당 역할 노드를 조건으로 참조하는가 */
const refers = (expr: string | undefined, node: string) =>
  !!expr && expr.includes(`root.child('${node}')`);

describe('database.rules.json 권한 계약', () => {
  describe('semesters — 스탭은 조회만 (2026-08-08 보강)', () => {
    it('read는 admins·retreatAdmins·iguardMembers를 허용한다', () => {
      for (const node of ['admins', 'retreatAdmins', 'iguardMembers']) {
        expect(refers(rules.semesters['.read'], node)).toBe(true);
      }
    });

    it('write에는 iguardMembers가 없다 — 스탭·이가드팀은 학기 데이터를 저장할 수 없다', () => {
      expect(refers(rules.semesters['.write'], 'iguardMembers')).toBe(false);
      expect(refers(rules.semesters['.write'], 'retreatAdmins')).toBe(true);
    });
  });

  describe('semestersPrivate — 연락처·지원 동기는 행정 전용', () => {
    it('read·write 모두 iguardMembers를 허용하지 않는다', () => {
      expect(refers(rules.semestersPrivate['.read'], 'iguardMembers')).toBe(false);
      expect(refers(rules.semestersPrivate['.write'], 'iguardMembers')).toBe(false);
    });
  });

  describe('attendanceAdmins — 출석부 전용 관리자는 플랫폼 노드에 접근하지 못한다', () => {
    it.each(['semesters', 'semestersPrivate', 'retreats', 'retreatsPrivate', 'admins'])(
      '%s 규칙에 attendanceAdmins가 없다',
      (node) => {
        const entry = rules[node];
        expect(entry, `${node} 규칙이 없다`).toBeTruthy();
        expect(refers(entry['.read'], 'attendanceAdmins')).toBe(false);
        expect(refers(entry['.write'], 'attendanceAdmins')).toBe(false);
      },
    );
  });
});
