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

function ruleValue(...segments: string[]): unknown {
  let current: unknown = rules;
  for (const segment of segments) {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) {
      throw new Error(`Rules 경로가 객체가 아닙니다: ${segments.join('/')}`);
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function ruleExpression(...segments: string[]): string {
  const value = ruleValue(...segments);
  if (typeof value !== 'string') {
    throw new Error(`Rules 식이 문자열이 아닙니다: ${segments.join('/')}`);
  }
  return value;
}

describe('database.rules.json 권한 계약', () => {
  it('출석부 관리자 목양 리포트는 데모 제외 설정을 확인한 공개 새친구 읽기로 제한한다', () => {
    const read = ruleExpression('semesters', '$sid', 'newFriends', '.read');
    expect(refers(read, 'attendanceAdmins')).toBe(true);
    expect(read).toContain("child('blockedDemoUid').isString()");
    expect(read).toContain("child('blockedDemoUid').val() !== auth.uid");
    const newFriendsWrite = ruleExpression('semesters', '$sid', 'newFriends', '.write');
    expect(refers(newFriendsWrite, 'attendanceAdmins')).toBe(false);
    expect(newFriendsWrite).toContain("child('barnabas')");
    expect(refers(rules.semesters['.read'], 'attendanceAdmins')).toBe(false);
    expect(refers(rules.semestersPrivate['.read'], 'attendanceAdmins')).toBe(false);
    expect(refers(ruleExpression('config', 'pastoralReport', 'blockedDemoUid', '.write'), 'attendanceAdmins')).toBe(false);
  });
  describe('semesters — 중앙 운영과 담당 팀 쓰기를 분리한다', () => {
    it('read는 admins·retreatAdmins·iguardMembers를 허용한다', () => {
      for (const node of ['admins', 'retreatAdmins', 'iguardMembers']) {
        expect(refers(rules.semesters['.read'], node)).toBe(true);
      }
    });

    it('루트 전체 쓰기를 없애고 학기·팀 경로에서 각각 권한을 검사한다', () => {
      expect(rules.semesters['.write']).toBeUndefined();
      const semesterWrite = ruleExpression('semesters', '$sid', '.write');
      expect(refers(semesterWrite, 'retreatAdmins')).toBe(true);
      expect(semesterWrite).toContain("child('semesterRole')");
      expect(semesterWrite).toContain("=== 'superAdmin'");

      const teamWrite = ruleExpression('semesters', '$sid', 'attendance', 'team', '$sessionId', '$applicationId', '.write');
      expect(refers(teamWrite, 'retreatAdmins')).toBe(true);
      expect(refers(teamWrite, 'iguardMembers')).toBe(true);
      expect(teamWrite).toContain("child('teamMemberships')");
      expect(teamWrite).toContain("child('semesters').child($sid)");
      expect(teamWrite).toContain("!== 'viewer'");
    });
  });

  describe('semestersPrivate — 연락처·지원 동기는 행정 전용', () => {
    it('read·write 모두 iguardMembers를 허용하지 않는다', () => {
      expect(refers(rules.semestersPrivate['.read'], 'iguardMembers')).toBe(false);
      expect(refers(rules.semestersPrivate['.write'], 'iguardMembers')).toBe(false);
      expect(rules.semestersPrivate['.read']).toContain("child('semesterRole')");
    });
  });

  describe('retreatsPrivate — 계좌·의료·주민번호는 민감정보 역할만 허용한다', () => {
    it('read·write가 방학 역할을 검사하고 조회 전용 역할·이가드 버킷을 허용하지 않는다', () => {
      for (const action of ['.read', '.write'] as const) {
        const expression = ruleExpression('retreatsPrivate', action);
        expect(expression).toContain("child('retreatRole').val() === 'pastor'");
        expect(expression).toContain("child('retreatRole').val() === 'adminTeam'");
        expect(expression).toContain("!root.child('retreatAdmins').child(auth.uid).child('retreatRole').exists()");
        expect(expression).not.toContain("child('retreatRole').val() === 'leader'");
        expect(refers(expression, 'iguardMembers')).toBe(false);
      }
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
    it('classes는 학생 1명 경로에만 열리고 이동 잠금 중에는 닫힌다', () => {
      const write = ruleExpression('classes', '$year', '$classKey', 'students', '$studentId', '.write');
      expect(write).toContain(ADMIN_TEAM);
      expect(write).toContain("child('studentMoveLocks')");
      expect(write).toContain('!root.');
      expect(ruleExpression('classes', '$year', '$classKey', '.write')).not.toContain('semesterRole');
    });

    it('attendance도 학생 1명 경로에만 열리고 이동 잠금 중에는 닫힌다', () => {
      const write = ruleExpression('attendance', '$year', '$classKey', '$studentId', '.write');
      expect(write).toContain(ADMIN_TEAM);
      expect(write).toContain("child('studentMoveLocks')");
      expect(ruleExpression('attendance', '$year', '$classKey', '.write')).not.toContain('semesterRole');
    });

    it('trash는 학생 복구본 경로에만 열린다 — 노드 전체는 관리자 전용 그대로다', () => {
      expect(ruleExpression('trash', '$year', 'students', '$studentId', '.write')).toContain(ADMIN_TEAM);
      expect(ruleExpression('trash', '$year', 'students', '$studentId', '.read')).toContain(ADMIN_TEAM);
      expect(rules.trash['.write']).not.toContain('semesterRole');
    });

    it('반 단위 쓰기는 관리자만 가능하고 자기 uid 이동 잠금만 허용한다', () => {
      for (const node of ['classes', 'attendance']) {
        const write = ruleExpression(node, '$year', '$classKey', '.write');
        expect(write).not.toContain("root.child('teacherClasses')");
        expect(write).not.toContain("root.child('userRoles')");
        expect(write).toContain("root.child('admins').child(auth.uid).val() === true");
        expect(write).toContain("root.child('attendanceAdmins').child(auth.uid).val() === true");
        expect(write).toContain("child('studentMoveLocks').child($year).child($classKey)");
        expect(write).toContain("child($classKey).child(auth.uid).exists()");
      }
    });
  });

  describe('교사 권한은 이메일이 일치하는 userRoles 단일 원천을 사용한다', () => {
    const directRoleExpressions = [
      ruleExpression('classes', '$year', '$classKey', '.read'),
      ruleExpression('attendance', '$year', '$classKey', '.read'),
      ruleExpression('attendance', '$year', '$classKey', '$studentId', '.write'),
      ruleExpression('teacherExtra', '$year', '$part', '$classKey', '.write'),
      ruleExpression('suggestions', '$year', '$classKey', '.read'),
      ruleExpression('suggestions', '$year', '$classKey', '.write'),
    ];

    it('teacherClasses 본인 쓰기를 제거해 로그인 사용자가 권한 원천을 위조할 수 없다', () => {
      const write = ruleExpression('teacherClasses', '$uid', '.write');
      expect(write).not.toContain('auth.uid === $uid');
      expect(refers(write, 'admins')).toBe(true);
      expect(refers(write, 'attendanceAdmins')).toBe(true);
    });

    it('교사 접근 경로는 토큰 이메일과 userRoles.email·role을 함께 확인한다', () => {
      for (const expression of directRoleExpressions) {
        expect(expression).toContain('auth.token.email != null');
        expect(expression).toContain("child('userRoles')");
        expect(expression).toContain("replace('.', '__dot__').replace('@', '__at__')");
        expect(expression).toContain("child('email').val() === auth.token.email");
        expect(expression).toContain("child('role').val() === 'teacher'");
        expect(expression).not.toContain("child('teacherClasses')");
      }
    });

    it('classes 명단 쓰기는 교사에게 열리지 않는다 — 관리 화면은 관리자 전용이다', () => {
      const write = ruleExpression('classes', '$year', '$classKey', '.write');
      expect(write).not.toContain("child('userRoles')");
      expect(write).not.toContain("child('teacherClasses')");
    });

    it('교사 attendance 단건 쓰기는 본인 반 roster 학생이며 이동 잠금이 없을 때만 허용한다', () => {
      const write = ruleExpression('attendance', '$year', '$classKey', '$studentId', '.write');
      expect(write).toContain("child('classes').child($year).child($classKey).child('students').child($studentId).exists()");
      expect(write).toContain("!root.child('config').child('studentMoveLocks').child($year).child($classKey).exists()");
    });
  });

  describe('학생 이동 잠금과 커밋 표식 계약', () => {
    it('config 상위 쓰기를 닫고 sheetSync와 lock year 쓰기만 관리자에게 연다', () => {
      expect(ruleValue('config', '.write')).toBeUndefined();
      for (const write of [
        ruleExpression('config', 'sheetSync', '.write'),
        ruleExpression('config', 'studentMoveLocks', '$year', '.write'),
      ]) {
        expect(refers(write, 'admins')).toBe(true);
        expect(refers(write, 'attendanceAdmins')).toBe(true);
      }
    });

    it('lock 레코드는 양쪽 반에 같은 메타데이터 형태로만 기록한다', () => {
      const lockPath = ['config', 'studentMoveLocks', '$year', '$classKey', '$ownerUid', '$operationId'];
      const validate = ruleExpression(...lockPath, '.validate');
      expect(validate).toContain("hasChildren(['phase', 'startedAt', 'fromCk', 'toCk', 'sid'])");
      expect(validate).toContain("child('fromCk').val() === $classKey");
      expect(validate).toContain("child('toCk').val() === $classKey");
      expect(validate).toContain("child('fromCk').val() !== newData.child('toCk').val()");
      expect(validate).not.toContain('auth.uid');
      expect(ruleExpression(...lockPath, 'phase', '.validate')).toContain("'preparing'");
      expect(ruleExpression(...lockPath, 'phase', '.validate')).toContain("'pending'");
      expect(ruleExpression(...lockPath, 'startedAt', '.validate')).toContain('newData.isNumber()');
      expect(ruleValue(...lockPath, '$other', '.validate')).toBe(false);
    });

    it('커밋 표식은 자기 uid로 한 번만 true를 만들며 사전 양쪽 pending lock을 요구한다', () => {
      const markerPath = [
        'config', 'studentMoveCommits', '$year', '$fromCk', '$toCk', '$sid', '$ownerUid', '$operationId',
      ];
      const write = ruleExpression(...markerPath, '.write');
      expect(refers(write, 'admins')).toBe(true);
      expect(refers(write, 'attendanceAdmins')).toBe(true);
      expect(write).toContain('auth.uid === $ownerUid');
      expect(write).toContain('!data.exists()');
      expect(write).toContain('newData.val() === true');
      expect(write).toContain('$fromCk !== $toCk');
      expect(write).toContain("child($fromCk).child($ownerUid).child($operationId)");
      expect(write).toContain("child($toCk).child($ownerUid).child($operationId)");
      expect(write.match(/child\('phase'\)\.val\(\) === 'pending'/g)).toHaveLength(2);
      expect(write).toContain("child('fromCk').val() === $fromCk");
      expect(write).toContain("child('toCk').val() === $toCk");
      expect(write).toContain("child('sid').val() === $sid");
      expect(write).toContain("child('startedAt').val() === root.child('config')");
      expect(ruleExpression(...markerPath, '.validate')).toBe('newData.val() === true');
    });
  });
});
