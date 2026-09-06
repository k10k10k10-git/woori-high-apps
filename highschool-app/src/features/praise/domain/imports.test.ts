/** 원본 회귀 이식. 실명 예외는 명시 설정으로 변경하며 THIRD_PARTY.md에 기록한다. */
import { test } from "vitest";
import assert from "node:assert/strict";
import { guessMapping, validateMappedRows, studentImportSchema, staffImportSchema } from "./imports";

test("한국어 학생 DB 열을 자동 매핑하고 표준 값으로 변환한다", () => {
  const headers = ["이름", "학년", "성별", "예배 부서", "팀", "인도자 여부"];
  const mapping = guessMapping(headers, "STUDENTS");
  const result = validateMappedRows("STUDENTS", [{ 이름: "김학생", 학년: "2학년", 성별: "여", "예배 부서": "1부", 팀: "싱어", "인도자 여부": "학생 인도자" }], mapping);
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.rows[0], {
    internalCode: null, name: "김학생", grade: 2, gender: "FEMALE", serviceDepartment: "FIRST",
    team: "SINGER", isStudentLeader: true, note: null, termNote: null, active: true,
  });
});

test("싱어팀·세션팀 열과 팀 접미사가 붙은 값을 인식한다", () => {
  const headers = ["이름", "학년", "성별", "부서", "싱어팀·세션팀"];
  const mapping = guessMapping(headers, "STUDENTS");
  const result = validateMappedRows("STUDENTS", [
    { 이름: "김학생", 학년: 1, 성별: "여", 부서: 1, "싱어팀·세션팀": "싱어팀" },
    { 이름: "이학생", 학년: 2, 성별: "남", 부서: 2, "싱어팀·세션팀": "세션 팀" },
  ], mapping);

  assert.equal(mapping["싱어팀·세션팀"], "team");
  assert.equal(result.errors.length, 0);
  assert.equal((result.rows[0] as { team: string })?.team, "SINGER");
  assert.equal((result.rows[1] as { team: string })?.team, "SESSION");
});

test("필수 열이 연결되지 않으면 행마다 반복하지 않고 한 번만 안내한다", () => {
  const headers = ["이름", "학년", "성별", "부서", "알 수 없는 팀 열"];
  const mapping = guessMapping(headers, "STUDENTS");
  const result = validateMappedRows("STUDENTS", [
    { 이름: "김학생", 학년: 1, 성별: "여", 부서: 1, "알 수 없는 팀 열": "싱어" },
    { 이름: "이학생", 학년: 2, 성별: "남", 부서: 2, "알 수 없는 팀 열": "세션" },
  ], mapping);

  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0]?.message ?? "", /필수 열 '팀'/);
});

test("이름·성별·팀만 있는 스탭 DB를 기본 예배와 역할로 변환한다", () => {
  const headers = ["이름", "성별", "팀"];
  const mapping = guessMapping(headers, "STAFF");
  const result = validateMappedRows("STAFF", [
    { 이름: "합성인도스탭", 성별: "남", 팀: "싱어팀, 세션팀" },
    { 이름: "합성세션스탭", 성별: "여", 팀: "세션팀" },
  ], mapping);

  assert.equal(mapping.팀, "roleTitle");
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.rows[0], {
    name: "합성인도스탭", email: null, gender: "MALE", roleTitle: "싱어팀, 세션팀",
    singerCapable: true, groupLeaderCapable: false, preferredService: "BOTH", note: null, active: true,
    defaultStageRole: "SINGER", excludeFromAutoSinger: false, isDefaultStageLeader: false,
  });
  assert.deepEqual(result.rows[1], {
    name: "합성세션스탭", email: null, gender: "FEMALE", roleTitle: "세션팀",
    singerCapable: false, groupLeaderCapable: false, preferredService: "BOTH", note: null, active: true,
    defaultStageRole: "SESSION", excludeFromAutoSinger: false, isDefaultStageLeader: false,
  });
});

test("필수값이 없으면 오류 행으로 분리한다", () => {
  const mapping = guessMapping(["이름", "학년", "성별", "예배 부서", "팀"], "STUDENTS");
  const result = validateMappedRows("STUDENTS", [{ 이름: "", 학년: "4", 성별: "", "예배 부서": "3부", 팀: "" }], mapping);
  assert.equal(result.rows.length, 0);
  assert.equal(result.errors[0]?.row, 2);
  assert.match(result.errors[0]?.message ?? "", /이름|학년|성별|예배 부서|팀/);
});

test("동명이인은 경고하고 내부 ID 중복은 오류로 표시한다", () => {
  const headers = ["내부 ID", "이름", "학년", "성별", "예배 부서", "팀"];
  const mapping = guessMapping(headers, "STUDENTS");
  const result = validateMappedRows("STUDENTS", [
    { "내부 ID": "S1", 이름: "김학생", 학년: 1, 성별: "남", "예배 부서": "1부", 팀: "싱어" },
    { "내부 ID": "S1", 이름: "김학생", 학년: 2, 성별: "여", "예배 부서": "2부", 팀: "세션" },
  ], mapping);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.errors.length, 1);
});

test("스탭의 이름은 권한·기본 인도자를 결정하지 않고 외부 ID에 연결된 설정만 적용한다", () => {
  const mapping = guessMapping(["이름", "성별", "팀"], "STAFF");
  const rows = [{ externalId: "source-staff-1", 이름: "같은이름", 성별: "남", 팀: "싱어" }, { externalId: "source-staff-2", 이름: "같은이름", 성별: "남", 팀: "싱어" }];
  const result = validateMappedRows("STAFF", rows, mapping, {
    staffDefaultsForRow: (row) => row.externalId === "source-staff-1" ? { isDefaultStageLeader: true, excludeFromAutoSinger: true } : undefined,
  });
  assert.equal(result.errors.length, 0);
  assert.equal((result.rows[0] as { isDefaultStageLeader: boolean }).isDefaultStageLeader, true);
  assert.equal((result.rows[1] as { isDefaultStageLeader: boolean }).isDefaultStageLeader, false);
});

test("명시 입력한 스탭 기본값은 이관 기본 정책보다 우선한다", () => {
  const row = { 이름: "합성스탭", 성별: "남", "기본 인도자": "아니오", "자동 싱어 제외": "아니오" };
  const result = validateMappedRows("STAFF", [row], guessMapping(Object.keys(row), "STAFF"), { staffDefaults: { isDefaultStageLeader: true, excludeFromAutoSinger: true } });
  assert.equal((result.rows[0] as { isDefaultStageLeader: boolean }).isDefaultStageLeader, false);
  assert.equal((result.rows[0] as { excludeFromAutoSinger: boolean }).excludeFromAutoSinger, false);
});

test("학년 부분 일치로 12학년을 1학년으로 바꾸지 않는다", () => {
  const headers = ["이름", "학년", "성별", "부서", "팀"];
  const row = { 이름: "합성학생", 학년: "12학년", 성별: "남", 부서: "1부", 팀: "싱어" };
  assert.equal(validateMappedRows("STUDENTS", [row], guessMapping(headers, "STUDENTS")).rows.length, 0);
  assert.equal(validateMappedRows("STUDENTS", [{ ...row, 학년: "고2" }], guessMapping(headers, "STUDENTS")).rows.length, 1);
});

test("검증기는 길이·자료형·이메일을 검사하고 알 수 없는 필드를 반환하지 않는다", () => {
  const student = { name: "합성학생", grade: 1, gender: "MALE", serviceDepartment: "FIRST", team: "SINGER" };
  const parsed = studentImportSchema.parse({ ...student, secret: "복제하지 않을 값" });
  assert.equal(Object.hasOwn(parsed, "secret"), false);
  for (const changed of [{ name: "" }, { name: "x".repeat(101) }, { grade: "1" }, { grade: 1.5 }, { active: "true" }, { note: "x".repeat(1001) }]) assert.equal(studentImportSchema.safeParse({ ...student, ...changed }).success, false);
  const staff = { name: "합성스탭", email: "staff@example.test", gender: "FEMALE", preferredService: "BOTH", defaultStageRole: "SINGER" };
  assert.equal(staffImportSchema.safeParse(staff).success, true);
  assert.equal(staffImportSchema.safeParse({ ...staff, email: "broken" }).success, false);
  assert.throws(() => staffImportSchema.parse({ ...staff, singerCapable: "yes" }));
});
