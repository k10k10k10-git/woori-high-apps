import { describe, expect, it } from "vitest";
import { paths as appPaths } from "@/lib/paths";
import { paths as semesterPaths } from "@/features/semester/paths";
import { paths as fieldPaths } from "@/features/iguard/lib/paths";
import { summarizeWrite } from "@/features/activityLog/writeModel";
import { dutyRecords, docRecords, DEFAULT_WORSHIP_DOCS } from "@/features/sundayWorship/worshipContent";
import { seatingRecords } from "@/features/sundayWorship/worshipSeating";
import { monthlyMinistryRecord, ministryGuideSectionRecords } from "@/features/ministryGuide/ministryGuidePersistence";

// 다른 앱 소유인 읽기 전용 경로와 로그 원장은 업무 쓰기 테스트에서 제외한다.
const readOnlyAppFactories = new Set([
  "activityLogEvents", "classesRoot", "classes", "attendanceRoot", "attendance", "events",
  "teacherStaff", "teacherSpecial", "teacherExtra", "teacherStaffRoot", "teacherSpecialRoot", "teacherExtraRoot", "teacherAdditionalRoot",
]);
const backupFactories = new Set([
  "participantsBackups", "participantsBackup", "participantContactsBackups", "groupsBackups", "groupsBackup", "roomsBackups", "roomsBackup",
  "syncDuplicates", "newFriendRosterBackup", "newFriendRemovalBackup", "newFriendPlacementCancellationBackup",
]);

const factories = [
  ...Object.entries(appPaths).filter(([name]) => !readOnlyAppFactories.has(name)).map(([name, factory]) => ({ source: "통합", name, factory })),
  ...Object.entries(semesterPaths).filter(([name]) => !["teacherStaffByYear", "classes", "classesByYear", "admins", "retreatAdmin"].includes(name)).map(([name, factory]) => ({ source: "학기", name, factory })),
  ...Object.entries(fieldPaths).filter(([name]) => name !== "classes").map(([name, factory]) => ({ source: "현장", name, factory })),
];

describe("실제 경로 팩터리와 활동 로그 지원 범위", () => {
  it.each(factories)("$source.$name 경로가 로그 연결 후 거부되지 않는다", async ({ name, factory }) => {
    // 실제 paths 함수를 호출하므로 경로 이동이나 새 루트 추가 시 분류기 누락을 드러낸다.
    const args = Array.from({ length: factory.length }, (_, index) => index === 0 ? "2026-2" : "record-a");
    const nodePath = Reflect.apply(factory, undefined, args) as string;
    const summary = await summarizeWrite({ [nodePath]: { updatedAt: 1, note: "기록에 복제하지 않을 원문" } }, "update");
    if (backupFactories.has(name)) expect(summary).toBeNull();
    else expect(summary).not.toBeNull();
    expect(JSON.stringify(summary)).not.toContain("기록에 복제하지 않을 원문");
  });

  it("예배 자리·담당표·자료와 사역 가이드의 실제 다중 경로 생성 결과를 허용한다", async () => {
    const groups = [
      seatingRecords("2026-09-06", "1", [{ id: "a", label: "가상 분단", totalRows: 5, blocks: [{ key: "1-1", rows: 2 }] }]),
      dutyRecords("2026-09-06", "1", [{ label: "가상 역할", names: ["가상담당"] }]),
      docRecords({ ...DEFAULT_WORSHIP_DOCS[0], body: "가상 예배 자료" }),
      [monthlyMinistryRecord(2026, { month: 9, curriculum: "가상 교과", focus: ["가상 일정"] })],
      ministryGuideSectionRecords({ id: "example", category: "예배·목양", title: "가상 안내", summary: "가상 요약", sourceNote: "가상 출처", principles: ["가상 원칙"], checklist: ["가상 점검"] }),
    ];
    for (const records of groups) {
      const patch = Object.fromEntries(records.map(record => [appPaths.prepMilestone(record.id), record.value]));
      const summary = await summarizeWrite(patch, "update");
      expect(summary?.area).toBe("schedule");
      expect(JSON.stringify(summary)).not.toMatch(/가상 (분단|역할|예배 자료|교과|일정|안내|요약|출처|원칙|점검)/);
    }
  });
});
