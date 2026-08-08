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

  // 2026-08-09: 교사 전화·생년월일(teacherStaff 40건)과 계정 목록(userRoles 51건)이
  // "로그인만 하면" 읽혔다. 역할 없는 구글 계정도 전부 읽을 수 있었다.
  describe('교사 개인정보 노드는 로그인만으로 읽히지 않는다', () => {
    it.each([
      'teacherStaff',
      'teacherSpecial',
      'teacherExtra',
      'teacherAdditional',
      'teacherPhones',
      'userRoles',
    ])('%s의 최상위 read가 auth != null 단독이 아니다', (node) => {
      expect(rules[node]['.read']).not.toBe('auth != null');
      expect(refers(rules[node]['.read'], 'admins')).toBe(true);
    });

    it('teacherStaff는 학기 접수·수련회 명단이 읽으므로 retreatAdmins·iguardMembers도 허용한다', () => {
      for (const role of ['retreatAdmins', 'iguardMembers']) {
        expect(refers(rules.teacherStaff['.read'], role)).toBe(true);
      }
    });

    it('userRoles 전체 목록은 관리자만, 본인 레코드는 이메일이 일치할 때만 읽는다', () => {
      expect(refers(rules.userRoles['.read'], 'attendanceAdmins')).toBe(true);
      // loadUserRole이 userRoles/{emailKey} 단건을 읽어 로그인을 판정한다 —
      // 이 자기조회 규칙이 없으면 담임 교사 전원이 로그인하지 못한다.
      const selfRead = (rules.userRoles as Record<string, { '.read'?: string }>).$emailKey?.['.read'];
      expect(selfRead).toContain('auth.token.email');
    });
  });
});
