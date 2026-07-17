import { describe, expect, it } from "vitest";
import { roleNamesForChecklist } from "@/lib/checklistMembers";
import type { Group, TeacherAttendance } from "@/lib/types";

const group: Group = {
  id: "group-1",
  name: "1조",
  bu: "1부",
  teachers: ["자차교사", "버스교사"],
  leader: "학생조장",
  studentIds: [],
};

const teachers: TeacherAttendance[] = [
  { id: "car", name: "자차교사", bu: "1부", classKey: "1-1", status: "전참", transport: "자차 출발" },
  { id: "bus", name: "버스교사", bu: "1부", classKey: "1-2", status: "전참", transport: "단체버스" },
];

describe("인원체크 교사 명단", () => {
  it("조별 인원체크에는 자차 교사를 포함한다", () => {
    expect(roleNamesForChecklist(group, teachers, "group"))
      .toEqual(["자차교사", "버스교사"]);
  });

  it("호차별 인원체크에서는 자차 교사와 학생 조장을 교사 명단에서 제외한다", () => {
    expect(roleNamesForChecklist(group, teachers, "bus"))
      .toEqual(["버스교사"]);
  });
});
