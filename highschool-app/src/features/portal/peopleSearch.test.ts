import { describe, expect, it } from "vitest";
import { buildPeopleProfiles, searchPeople, type PeopleSearchData } from "./peopleSearch";

function fixture(): PeopleSearchData {
  return {
    classes: {
      2025: { "1-1-2": { teacher: "김교사", students: { minchae: { name: "강민채", birth: "2010-03-04", phone: "010-1111-2222", school: "우리중" } } } },
      2026: {
        "1-2-3": { teacher: "이교사", students: { minchae: { name: "강민채", birth: "2010.03.04", phone: "01011112222", school: "우리중" } } },
        "2-2-4": { teacher: "박교사", students: { other: { name: "강민채", birth: "2010-09-09", phone: "010-9999-8888" } } },
      },
    },
    attendance: {
      2026: { "1-2-3": { minchae: { a: "O", b: "T", c: "X" } } },
    },
    semesters: {
      "2026-1": {
        meta: { title: "2026년 1학기" },
        teams: { media: { name: "미디어팀" } },
        trainingClasses: { basic: { name: "기초훈련" } },
        applications: { "1_minchae": { name: "강민채", studentId: "minchae", bu: "1부", grade: 2, class: 3, status: "배치", teamId: "media", trainingClassId: "basic" } },
        attendance: { team: { s1: { "1_minchae": { s: "출석" } } } },
      },
    },
    semestersPrivate: {
      "2026-1": { applicationsPrivate: { "1_minchae": { phone: "01011112222", motive: "예배를 섬기고 싶어요" } } },
    },
    retreats: {
      summer: {
        name: "2026 여름수련회", year: 2026,
        participants: { p1: { name: "강민채", studentId: "minchae", bu: "1부", grade: 2, class: 3, gender: "여" } },
        groups: { g1: { name: "3조", studentIds: ["1_minchae"] } },
        rooms: { r1: { roomNumber: "203호", studentIds: ["1_minchae"] } },
        cellColors: { "1_minchae": "blue" },
        tshirtOrders: { t1: { name: "강민채", bu: "1부", grade: 2, class: 3, size: "M(95)", design: "1번" } },
      },
    },
    retreatsPrivate: {},
  };
}

describe("학생 통합검색", () => {
  it("같은 식별자의 연도별 학적·사역·수련회 기록을 한 사람으로 연결한다", () => {
    const profiles = buildPeopleProfiles(fixture());
    const target = profiles.find((profile) => profile.records.some((record) => record.title.includes("기초훈련")));
    expect(target?.records.map((record) => record.category)).toEqual(expect.arrayContaining(["학적·출석", "학기 중 사역", "수련회"]));
    expect(target?.records.some((record) => record.fields.some((item) => item.value.includes("출석 1 · 지각 1 · 결석 1")))).toBe(true);
    expect(target?.records.some((record) => record.title === "단체티")).toBe(true);
  });

  it("같은 이름이어도 생년과 연락처가 충돌하면 동명이인으로 분리한다", () => {
    const results = searchPeople(buildPeopleProfiles(fixture()), "강민채");
    expect(results).toHaveLength(2);
    expect(results.every((profile) => profile.ambiguous)).toBe(true);
  });

  it("두 글자 미만 검색은 전체 명단을 노출하지 않는다", () => {
    expect(searchPeople(buildPeopleProfiles(fixture()), "강")).toEqual([]);
  });
});
