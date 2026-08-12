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

    // 2026-08-09 2차: 역할 멤버십 목록(이메일·이름)도 로그인만으로 읽혔다.
    // 단, 두 AuthContext가 자기 uid를 읽어 역할을 판정하고 실패하면 role="none"으로
    // 떨어지므로, 자기조회를 남기지 않으면 비관리자 전원이 앱에서 잠긴다.
    describe.each(['retreatAdmins', 'iguardMembers', 'iguardRoles'])('%s', (node) => {
      it('목록은 역할 보유자만 읽는다', () => {
        const read = rules[node]['.read'];
        expect(read).not.toBe('auth != null');
        for (const role of ['admins', 'retreatAdmins', 'iguardMembers']) {
          expect(refers(read, role)).toBe(true);
        }
      });

      it('본인 uid는 언제나 읽을 수 있다 — 없으면 역할 판정이 실패해 전원 잠긴다', () => {
        const selfRead = (rules[node] as Record<string, { '.read'?: string }>).$uid?.['.read'];
        expect(selfRead).toBe('auth != null && auth.uid === $uid');
      });
    });

    // 교사·스탭 앱은 2026-08-12 제거했고 staff_* 노드도 데이터가 비어 있어 규칙에서 뺐다.
    // 루트에 기본 규칙이 없으므로 이 경로들은 이제 "규칙 없음 = 전면 거부" 상태다.
    it.each(['staff_admins', 'staff_roles', 'staff_attendance', 'staff_events'])(
      '%s 규칙은 제거된 상태를 유지한다 (되살리려면 앱부터 복원할 것)',
      (node) => {
        expect(rules[node]).toBeUndefined();
      },
    );

    it('teacherStaff는 남아 있다 — 통합 앱의 스탭 접수가 읽는 다른 노드다', () => {
      expect(rules.teacherStaff).toBeDefined();
    });

    it('userRoles 전체 목록은 관리자만, 본인 레코드는 이메일이 일치할 때만 읽는다', () => {
      expect(refers(rules.userRoles['.read'], 'attendanceAdmins')).toBe(true);
      // loadUserRole이 userRoles/{emailKey} 단건을 읽어 로그인을 판정한다 —
      // 이 자기조회 규칙이 없으면 담임 교사 전원이 로그인하지 못한다.
      const selfRead = (rules.userRoles as Record<string, { '.read'?: string }>).$emailKey?.['.read'];
      expect(selfRead).toContain('auth.token.email');
    });
  });
  describe('행정팀의 새친구 원장 반영 (2026-08-12 신설)', () => {
    // 통합 앱의 retreatAdmins/{uid}.semesterRole === "adminTeam"만 학생 1명 경로를 쓴다.
    // 반 전체(students 통째·teacher)나 출석 전체를 열면 안 된다 — 범위가 넓어지면 여기서 깨진다.
    const ADMIN_TEAM = "root.child('retreatAdmins').child(auth.uid).child('semesterRole').val() === 'adminTeam'";
    const classes = rules.classes as unknown as Record<string, any>;
    const attendance = rules.attendance as unknown as Record<string, any>;
    const trash = rules.trash as unknown as Record<string, any>;

    it('classes는 학생 1명 경로에만 열린다 — 반 노드 자체는 그대로다', () => {
      expect(classes.$year.$classKey.students.$studentId['.write']).toContain(ADMIN_TEAM);
      expect(classes.$year.$classKey['.write']).not.toContain('semesterRole');
    });

    it('attendance도 학생 1명 경로에만 열린다', () => {
      expect(attendance.$year.$classKey.$studentId['.write']).toContain(ADMIN_TEAM);
      expect(attendance.$year.$classKey['.write']).not.toContain('semesterRole');
    });

    it('trash는 학생 복구본 경로에만 열린다 — 노드 전체는 관리자 전용 그대로다', () => {
      expect(trash.$year.students.$studentId['.write']).toContain(ADMIN_TEAM);
      expect(trash.$year.students.$studentId['.read']).toContain(ADMIN_TEAM);
      expect(trash['.write']).not.toContain('semesterRole');
    });

    it('교사의 본인 반 쓰기와 관리자 조건은 그대로 남아 있다 (회귀)', () => {
      for (const node of [classes, attendance]) {
        const write = node.$year.$classKey['.write'] as string;
        expect(write).toContain("root.child('teacherClasses').child(auth.uid).val() === $classKey");
        expect(write).toContain("root.child('admins').child(auth.uid).val() === true");
        expect(write).toContain("root.child('attendanceAdmins').child(auth.uid).val() === true");
      }
    });
  });
});
