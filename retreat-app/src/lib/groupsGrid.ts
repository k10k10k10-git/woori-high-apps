import { Group, Student, TeacherAttendance } from "./types";
import { resolveGroupRoleStudent } from "./groupRoleStudent";
import { teacherPrintStatus, teacherPrintStatusLabel, resolvePrintGender } from "./groupPrint";
import { groupDisplayName } from "./groupNumber";

/** 조편성 엑셀 그리드(조=열, 세로 나열)의 셀 종류 — 색상 매핑은 소비자(GroupsTab)가 한다. */
export type GroupsGridCellKind = "header" | "teacher" | "leader" | "staff" | "male" | "female";

export interface GroupsGridCell {
  text: string;
  kind: GroupsGridCellKind;
  /** 취소/부분참(학생 셀색상), 불참/부분참(교사 상태) — 표기와 색 오버라이드용 */
  status?: "취소" | "부분참" | "불참";
}

/** GroupsTab과 동일한 콤마 구분 이름 파서 (조장/스탭 필드 전용 — busStaff 파서와 의미가 다르니 통합 금지) */
const parseNames = (csv: string) => (csv || "").split(",").map(s => s.trim()).filter(Boolean);

/**
 * 한 부(bu)의 조들을 "조=열" 그리드로 변환 — 신청자 취합 반별 그리드와 같은 느낌의 엑셀 출력용 순수 모델.
 * 열 내용(위→아래): 조명 헤더 → 교사(불참/부분참 상태) → 조장 → 스탭 → 학생.
 * 학생 정렬·역할 분리·상태 판정은 조편성 PDF(buildGroupsHtml)와 동일 규칙을 재사용한다.
 */
export function buildGroupsGridColumns(
  buGroups: Group[],                       // 이미 부서 필터+정렬된 목록
  allGroups: Group[],                      // groupDisplayName의 전역 번호 계산용
  students: Record<string, Student>,
  cellColors: Record<string, string>,
  allTeachers: TeacherAttendance[],
  genderByStudentKey: Map<string, string>, // 신청폼 성별 (없으면 반 홀짝 폴백)
): GroupsGridCell[][] {
  return buGroups.map(g => {
    const col: GroupsGridCell[] = [];
    const leaderNames = new Set(parseNames(g.leader || ""));
    const staffNames = new Set(parseNames(g.staff || ""));

    col.push({
      text: groupDisplayName(g, allGroups) + (g.gbs ? ` (${g.gbs})` : ""),
      kind: "header",
    });

    (g.teachers || []).forEach(name => {
      const label = teacherPrintStatusLabel(teacherPrintStatus(allTeachers, name, g.bu));
      col.push({ text: name, kind: "teacher", ...(label ? { status: label } : {}) });
    });

    const roleCell = (name: string, kind: "leader" | "staff"): GroupsGridCell => {
      const s = resolveGroupRoleStudent(students, g, name);
      return { text: s ? `${name} ${s.grade}-${s.class}` : name, kind };
    };
    [...leaderNames].forEach(name => col.push(roleCell(name, "leader")));
    [...staffNames].forEach(name => col.push(roleCell(name, "staff")));

    const filteredIds = (g.studentIds || []).filter(sid => {
      const s = students[sid];
      return !s || (!leaderNames.has(s.name) && !staffNames.has(s.name));
    });
    const sortedIds = [...filteredIds].sort((a, b) => {
      const sa = students[a], sb = students[b];
      if (!sa && !sb) return 0; if (!sa) return 1; if (!sb) return -1;
      return (sb.grade - sa.grade) || (sa.class - sb.class) || sa.name.localeCompare(sb.name, "ko");
    });
    sortedIds.forEach(sid => {
      const s = students[sid];
      if (!s) return;
      const gender = resolvePrintGender(genderByStudentKey.get(sid), s.class);
      const color = cellColors[sid];
      const status = color === "red" ? "취소" as const : color === "orange" ? "부분참" as const : undefined;
      col.push({
        text: `${s.name} ${s.grade}-${s.class}`,
        kind: gender === "남" ? "male" : "female",
        ...(status ? { status } : {}),
      });
    });

    return col;
  });
}
