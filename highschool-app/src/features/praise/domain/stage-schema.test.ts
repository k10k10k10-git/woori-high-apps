import { expect, it } from "vitest";
import { stageOverrideSchema } from "./stage-schema";

it("Firebase 학생 키와 명시 강제 역할을 검증한다", () => {
  expect(stageOverrideSchema.parse({ termStudentId: "app_123", kind: "FORCE_STAGE", department: "FIRST", role: "RANDOM" })).toEqual({ termStudentId: "app_123", kind: "FORCE_STAGE", department: "FIRST", role: "RANDOM" });
  expect(stageOverrideSchema.safeParse({ termStudentId: "app_123", kind: "FORCE_STAGE", department: "FIRST" }).success).toBe(false);
});

it("제외·이동에는 역할을 넣지 않고 잘못된 경로와 강제 형변환을 거부한다", () => {
  const valid = { termStudentId: "app_123", kind: "EXCLUDE_STAGE", department: "FIRST" };
  expect(stageOverrideSchema.safeParse(valid).success).toBe(true);
  for (const patch of [{ role: "SINGER" }, { termStudentId: "a/b" }, { termStudentId: "a.b" }, { termStudentId: "" }, { termStudentId: "x".repeat(129) }, { kind: { toString: () => "EXCLUDE_STAGE" } }, { department: [] }]) expect(stageOverrideSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
});
