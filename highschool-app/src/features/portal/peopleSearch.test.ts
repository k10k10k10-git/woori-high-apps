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

describe("인물 통합검색", () => {
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

  it("학생과 스탭은 이름과 가족 연락처가 같아도 별도 인물로 분리한다", () => {
    const data: PeopleSearchData = {
      classes: {
        2024: {
          "1-3-2": {
            teacher: "우남원",
            students: {
              student24: { name: "김수현", birth: "2006-01-29", pphone: "010-5555-0000" },
            },
          },
        },
      },
      attendance: {},
      semesters: {
        "2026-1": {
          meta: { title: "2026년 1학기" },
          teams: { design: { name: "기획디자인팀" } },
          applications: {
            s_staff01: { name: "김수현", studentId: "staff01", bu: "스탭", grade: 0, class: 0, teamId: "design" },
          },
        },
      },
      semestersPrivate: {
        "2026-1": { applicationsPrivate: { s_staff01: { phone: "010-5555-0000" } } },
      },
      retreats: {},
      retreatsPrivate: {},
    };

    const results = searchPeople(buildPeopleProfiles(data), "김수현");
    expect(results).toHaveLength(2);
    expect(results.map((profile) => profile.kinds)).toEqual(expect.arrayContaining([["student"], ["staff"]]));
    expect(results.every((profile) => profile.ambiguous)).toBe(true);
  });

  it("같은 스탭 ID의 여러 학기 기록은 한 사람으로 연결한다", () => {
    const semester = (title: string) => ({
      meta: { title },
      teams: { design: { name: "기획디자인팀" } },
      applications: {
        s_staff01: { name: "김수현", studentId: "staff01", bu: "스탭", grade: 0, class: 0, teamId: "design" },
      },
    });
    const data: PeopleSearchData = {
      classes: {}, attendance: {}, retreats: {}, retreatsPrivate: {}, semestersPrivate: {},
      semesters: { "2026-1": semester("2026년 1학기"), "2026-2": semester("2026년 2학기") },
    };

    const results = searchPeople(buildPeopleProfiles(data), "김수현");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ kinds: ["staff"], ambiguous: false });
    expect(results[0].records).toHaveLength(2);
  });

  it("학생·교사·스탭의 이름이 같으면 세 인물 유형으로 분리한다", () => {
    const data: PeopleSearchData = {
      classes: { 2026: { "1-1-1": { students: { student01: { name: "박동일" } } } } },
      attendance: {},
      semesters: {
        "2026-1": {
          applications: {
            s_staff01: { name: "박동일", studentId: "staff01", bu: "스탭" },
          },
        },
      },
      semestersPrivate: {},
      retreats: {
        summer: {
          name: "2026 여름수련회",
          year: 2026,
          participants: {
            teacher01: { name: "박동일", studentId: "teacher01", bu: "교사" },
          },
        },
      },
      retreatsPrivate: {},
    };

    const results = searchPeople(buildPeopleProfiles(data), "박동일");
    expect(results).toHaveLength(3);
    expect(results.map((profile) => profile.kinds[0]).sort()).toEqual(["staff", "student", "teacher"]);
    expect(results.every((profile) => profile.ambiguous)).toBe(true);
  });

  it("이름만 같고 안정 ID가 다른 연도별 학생은 자동 연결하지 않는다", () => {
    const data: PeopleSearchData = {
      classes: {
        2024: { "1-1-1": { students: { first: { name: "이동명", pphone: "010-7777-0000" } } } },
        2025: { "1-2-1": { students: { second: { name: "이동명", pphone: "010-7777-0000" } } } },
      },
      attendance: {}, semesters: {}, semestersPrivate: {}, retreats: {}, retreatsPrivate: {},
    };

    const results = searchPeople(buildPeopleProfiles(data), "이동명");
    expect(results).toHaveLength(2);
    expect(results.every((profile) => profile.kinds[0] === "student" && profile.ambiguous)).toBe(true);
  });

  it("두 글자 미만 검색은 전체 명단을 노출하지 않는다", () => {
    expect(searchPeople(buildPeopleProfiles(fixture()), "강")).toEqual([]);
  });
});
