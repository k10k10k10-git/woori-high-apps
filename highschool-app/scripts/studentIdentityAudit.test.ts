import { describe, expect, it } from "vitest";
import { auditStudentIdentities } from "./studentIdentityAudit";

type TestStudent = { name: string; birth?: string; phone?: string; pphone?: string; personId?: string };
const ownPhone = "010-1111-2222";
const parentPhone = "010-9999-8888";
const student = (name: string, extra: Partial<TestStudent> = {}): TestStudent => ({ name, ...extra });

function snapshot(entries: Array<[string, string, string, TestStudent]>) {
  const classes: Record<string, Record<string, { students: Record<string, TestStudent> }>> = {};
  for (const [year, classKey, id, value] of entries) {
    classes[year] ??= {};
    classes[year][classKey] ??= { students: {} };
    classes[year][classKey].students[id] = value;
  }
  return classes;
}

describe("연도별 학생 동일인 로컬 감사", () => {
  it("실제 통합검색이 이미 연결한 정상 진급 기록은 제외하고 분리 이름만 센다", () => {
    const classes = snapshot([
      ["2024", "1-1-1", "old", student("101김연결A", { birth: "2010-01-02" })],
      ["2025", "1-2-2", "new", student("김 연결", { birth: "2010.01.02" })],
      ["2024", "1-1-1", "missingOld", student("이누락")],
      ["2025", "1-2-2", "missingNew", student("이누락")],
      ["2025", "1-2-2", "ignored", student("")],
    ]);
    const before = JSON.stringify(classes);
    const result = auditStudentIdentities(classes);

    expect(result.counts).toEqual({
      studentRecords: 5, profiles: 3, ignoredRecords: 1, splitNames: 1,
      strongCandidatePairs: 0, strongCandidateNames: 0,
      byYear: [{ year: "2024", studentRecords: 2, profiles: 2 }, { year: "2025", studentRecords: 3, profiles: 2 }],
    });
    expect(result.cases[0].normalizedName).toBe("이누락");
    expect(result.cases[0].comparisons[0].reasons).toContain("birth_missing");
    expect(JSON.stringify(classes)).toBe(before);
  });

  it("생년 누락·6/8자리 표기 차이는 양쪽 연락처까지 일치할 때 사람 확인 후보로 표시하고 원문을 숨긴다", () => {
    const result = auditStudentIdentities(snapshot([
      ["2024", "1-1-1", "a", student("김형식", { birth: "100102", phone: ownPhone, pphone: parentPhone })],
      ["2025", "1-2-2", "b", student("김형식", { birth: "2010-01-02", phone: "01011112222", pphone: "01099998888" })],
      ["2024", "2-1-1", "c", student("김누락", { phone: ownPhone, pphone: parentPhone })],
      ["2025", "2-2-2", "d", student("김누락", { birth: "2010-01-02", phone: ownPhone, pphone: parentPhone })],
    ]));
    expect(result.counts).toMatchObject({ strongCandidatePairs: 2, strongCandidateNames: 2 });
    expect(result.cases.flatMap((item) => item.comparisons)).toEqual(expect.arrayContaining([
      expect.objectContaining({ birth: "6_vs_8_digits", ownPhone: "same", parentPhone: "same", strongCandidate: true, requiresHumanReview: true }),
      expect.objectContaining({ birth: "one_missing", strongCandidate: true }),
    ]));
    for (const sensitive of ["100102", "2010-01-02", ownPhone, parentPhone, "01011112222", "01099998888"]) {
      expect(JSON.stringify(result)).not.toContain(sensitive);
    }
  });

  it("생년 충돌·부서 변경·진급 불일치·연락처 누락·비정상 생년은 강한 후보로 올리지 않는다", () => {
    const base = { phone: ownPhone, pphone: parentPhone };
    const result = auditStudentIdentities(snapshot([
      ["2024", "1-1-1", "a", student("김충돌", { ...base, birth: "2010-01-02" })],
      ["2025", "1-2-1", "b", student("김충돌", { ...base, birth: "2010-01-03" })],
      ["2024", "1-1-1", "c", student("김부서", base)],
      ["2025", "2-2-1", "d", student("김부서", base)],
      ["2024", "1-1-1", "e", student("김진급", base)],
      ["2025", "1-3-1", "f", student("김진급", base)],
      ["2024", "1-1-1", "g", student("김전화", { pphone: parentPhone })],
      ["2025", "1-2-1", "h", student("김전화", { pphone: parentPhone })],
      ["2024", "1-1-1", "i", student("김표기", { ...base, birth: "미상" })],
      ["2025", "1-2-1", "j", student("김표기", base)],
    ]));
    expect(result.counts.strongCandidatePairs).toBe(0);
    expect(result.cases.flatMap((item) => item.comparisons.flatMap((pair) => pair.reasons)))
      .toEqual(expect.arrayContaining(["birth_conflict", "department_changed", "progression_mismatch", "birth_invalid_format"]));
    expect(result.cases.find((item) => item.normalizedName === "김전화")?.comparisons[0])
      .toMatchObject({ ownPhone: "both_missing", parentPhone: "same", strongCandidate: false });
  });

  it("동년 다른 학생은 personId 문자열이 같아도 실제 프로필 개수와 중복을 구분한다", () => {
    const personId = "person_student_duplicate";
    const result = auditStudentIdentities(snapshot([
      ["2026", "1-1-1", "a", student("김동명", { personId, birth: "2010-01-02" })],
      ["2026", "1-1-2", "b", student("김동명", { personId, birth: "2010-01-02" })],
    ]));
    expect(result.counts).toMatchObject({ studentRecords: 2, profiles: 2, splitNames: 1, strongCandidatePairs: 0 });
    expect(result.cases[0]).toMatchObject({ profileCount: 2, sameYearDuplicateYears: ["2026"] });
    expect(result.cases[0].comparisons[0]).toMatchObject({ personId: "same", strongCandidate: false });
    expect(result.cases[0].comparisons[0].reasons).toContain("same_year_duplicate");
    expect(new Set(result.cases[0].records.map((record) => record.profileIndex)).size).toBe(2);
  });

  it("한쪽 연도에 동명 후보가 둘이면 양쪽 전화가 같아도 어느 쌍도 강한 후보로 올리지 않는다", () => {
    const contacts = { phone: ownPhone, pphone: parentPhone };
    const result = auditStudentIdentities(snapshot([
      ["2025", "1-2-1", "a", student("김복수", contacts)],
      ["2025", "1-2-2", "b", student("김복수", contacts)],
      ["2026", "1-3-1", "c", student("김복수", contacts)],
    ]));
    expect(result.counts).toMatchObject({ strongCandidatePairs: 0, strongCandidateNames: 0 });
    expect(result.cases[0].sameYearDuplicateYears).toEqual(["2025"]);
    const crossYear = result.cases[0].comparisons.filter((pair) => pair.differentYear);
    expect(crossYear).toHaveLength(2);
    expect(crossYear.every((pair) => pair.normalProgression && pair.ownPhone === "same" && pair.parentPhone === "same")).toBe(true);
    expect(crossYear.every((pair) => !pair.strongCandidate && pair.reasons.includes("ambiguous_candidate"))).toBe(true);
  });

  it("서로 다른 영구 ID와 학생 키를 표시하고 잘못된 루트 입력은 거절한다", () => {
    const result = auditStudentIdentities(snapshot([
      ["2024", "1-1-1", "old", student("김식별", { personId: "person_student_old" })],
      ["2025", "1-2-1", "new", student("김식별", { personId: "person_student_new" })],
    ]));
    expect(result.cases[0].comparisons[0].reasons).toEqual(expect.arrayContaining(["person_id_difference", "student_id_difference"]));
    expect(() => auditStudentIdentities([] as unknown as Record<string, unknown>)).toThrow("classes 루트 객체");
  });
});
