// ════════════════════════════════════════════════════════════
// 행정 모듈과의 데이터 형태 계약 런타임 점검.
// 행정이 classes 키 형식·조 'bu' 규칙 등을 바꾸면 이가드가 조용히 틀어지는 것을
// 막기 위해, 로드된 데이터를 보고 의심 신호를 경고로 표면화한다.
// 단일 원천 계약: classes/{year} 키 = `{부}-{학년}-{반}`, uniqueKey = `${buNum}_${studentId}`,
//                조 bu = "1부" | "2부".
//
// 이 점검은 행정·이가드가 **별개 앱**(retreat-app / iguard-app)이던 시절에 생겼고,
// 2026-08-05 통합 이후에도 유지한다 — 두 모듈은 여전히 서로의 배포 주기와 무관하게
// 바뀌고, 행정이 쓰는 노드를 이가드는 읽기만 하므로 형태가 어긋나도 타입만으로는
// 드러나지 않는다. 소유권 계약은 DB_OWNERSHIP.md, 이력은 docs/HISTORY.md 참조.
// ════════════════════════════════════════════════════════════
import { Student, Group } from "./types";

export interface CompatWarning {
  text: string;
  hint?: string;
}

export function checkAdminCompat(
  students: Record<string, Student>,
  groups: Group[]
): CompatWarning[] {
  const out: CompatWarning[] = [];
  const studentList = Object.values(students);

  // A) classes/{year} 키 파싱 실패 — grade/class/buNum이 숫자로 안 떨어짐
  const badParse = studentList.filter(
    s => Number.isNaN(s.grade) || Number.isNaN(s.class) || s.buNum == null || Number.isNaN(s.buNum)
  );
  if (studentList.length > 0 && badParse.length > 0) {
    out.push({
      text: `명단 파싱 이상 ${badParse.length}명`,
      hint: "행정의 classes 키 형식(부-학년-반)이 바뀌었을 수 있어요. 조별 정보·인원체크의 학년/반 표시를 확인하세요.",
    });
  }

  // B) 조편성의 학생 ID가 명단과 매칭되지 않음 — 연도/식별자 형식 불일치 신호
  const allIds = groups.flatMap(g => g.studentIds || []);
  if (allIds.length > 0) {
    const orphans = allIds.filter(id => !students[id]);
    const ratio = orphans.length / allIds.length;
    // 일부 미해결은 정상(삭제 등)이므로 30% 이상 체계적 불일치일 때만 경고
    if (ratio >= 0.3) {
      out.push({
        text: `조편성 학생 ${orphans.length}/${allIds.length}명이 명단과 매칭 안 됨`,
        hint: "수련회 연도 또는 학생 식별자 형식이 행정과 어긋났을 수 있어요. 인원체크에 '(명단 미상)'이 많다면 이 문제입니다.",
      });
    }
  }

  // C) 조 'bu' 값이 예상(1부/2부)과 다름 — 조 전역 번호 표시가 어긋남
  const badBuValues = [...new Set(groups.map(g => g.bu).filter(bu => bu && bu !== "1부" && bu !== "2부"))];
  if (badBuValues.length > 0) {
    out.push({
      text: `조 '부' 값이 예상과 다름 (${badBuValues.join(", ")})`,
      hint: "조 번호 표시(1부/2부 전역 번호)가 어긋날 수 있어요.",
    });
  }

  return out;
}
