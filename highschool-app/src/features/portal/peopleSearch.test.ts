import { describe, expect, it } from "vitest";
import { buildPeopleProfiles, groupPersonRecordsByYear, searchPeople, type PeopleSearchData } from "./peopleSearch";

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
        attendance: { team: { s1: { "1_minchae": { s: "출석" } }, s2: { "1_minchae": { s: "지각" } } } },
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
        onSiteReg: { onsite1: { name: "강민채", studentId: "minchae", bu: "1부", grade: 2, class: 3 } },
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
    expect(target?.records.map((record) => record.category)).toEqual(expect.arrayContaining(["학적·출석", "학기 운영", "수련회"]));
    expect(target?.records.some((record) => record.fields.some((item) => item.value.includes("출석 2 · 결석 1")))).toBe(true);
    expect(target?.records.some((record) => record.fields.some((item) => item.value.includes("출석 1 · 지각 1 · 결석 0")))).toBe(true);
    expect(target?.records.some((record) => record.title === "단체티")).toBe(true);
    expect(target?.records.some((record) => record.title === "현장 등록")).toBe(false);
  });

  it("인물 상세 기록을 최신 연도부터 묶고 해당 연도의 사역·수련회 정보를 함께 보여준다", () => {
    const target = buildPeopleProfiles(fixture()).find((profile) => profile.records.some((record) => record.title.includes("기초훈련")));
    const groups = groupPersonRecordsByYear(target?.records ?? []);

    expect(groups.map((group) => group.label)).toEqual(["2026년", "2025년"]);
    expect(groups[0].records.map((record) => record.category)).toEqual(expect.arrayContaining(["학적·출석", "학기 운영", "수련회"]));
    expect(groups[1].records.every((record) => record.period.includes("2025"))).toBe(true);
  });

  it("같은 수련회의 중복 참가 행은 최신 신청·배정 카드 하나로 합치고 이전 필드도 보존한다", () => {
    const data = fixture();
    const summer = data.retreats.summer as Record<string, unknown>;
    summer.participants = {
      old: {
        name: "강민채", studentId: "minchae", bu: "1부", grade: 2, class: 3,
        gender: "여", registeredAt: "2026. 1. 4 오전 10:25:06",
      },
      latest: {
        name: "강민채", studentId: "minchae", bu: "1부", grade: 2, class: 3,
        phone: "010-1111-2222", registeredAt: "2026. 6. 21 오전 9:24:18",
      },
    };
    summer.cellColors = { old: "green", latest: "blue" };

    const target = buildPeopleProfiles(data).find((profile) => profile.records.some((record) => record.title.includes("기초훈련")));
    const retreatRecords = target?.records.filter((record) => record.title === "수련회 신청·배정") ?? [];

    expect(retreatRecords).toHaveLength(1);
    expect(retreatRecords[0].fields).toEqual(expect.arrayContaining([
      { label: "신청 상태", value: "입금완료" },
      { label: "신청일", value: "2026. 6. 21 오전 9:24:18" },
      { label: "성별", value: "여" },
    ]));
  });

  it("수련회 참가자 연락처는 비공개 경로를 우선하고 공개 레거시 값도 하위호환한다", () => {
    const data = fixture();
    const summer = data.retreats.summer as Record<string, unknown>;
    summer.participants = {
      p1: { name: "강민채", studentId: "minchae", bu: "1부", grade: 2, class: 3, phone: "010-old", pPhone: "010-parent-old" },
    };
    data.retreatsPrivate = { summer: { participantContacts: { p1: { phone: "010-new" } } } };

    const target = buildPeopleProfiles(data).find((profile) => profile.records.some((record) => record.title === "수련회 신청·배정"));
    const fields = target?.records.find((record) => record.title === "수련회 신청·배정")?.fields ?? [];

    expect(fields).toContainEqual({ label: "학생 연락처", value: "010-new", sensitive: true });
    expect(fields).toContainEqual({ label: "보호자 연락처", value: "010-parent-old", sensitive: true });
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

  it("연도별 학생 ID가 달라도 생년월일과 본인 연락처가 함께 일치하면 연결한다", () => {
    const data: PeopleSearchData = {
      classes: {
        2024: { "2-2-6": { students: { old: { name: "김예원", birth: "2010-01-02", phone: "010-1111-2222" } } } },
        2025: { "2-3-6": { students: { promoted: { name: "김예원", birth: "2010.01.02", phone: "01011112222" } } } },
      },
      attendance: {}, semesters: {}, semestersPrivate: {}, retreats: {}, retreatsPrivate: {},
    };

    const results = searchPeople(buildPeopleProfiles(data), "김예원");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ kinds: ["student"], ambiguous: false });
    expect(results[0].records).toHaveLength(2);
  });

  it("연락처가 변경되거나 누락되어도 이름·생년월일·부서·정상 진급이 유일하면 연결한다", () => {
    const data: PeopleSearchData = {
      classes: {
        2024: { "2-1-6": { students: { first: { name: "이수인", personId: "person_student_2024", birth: "2010-05-01" } } } },
        2025: { "2-2-6": { students: { second: { name: "이수인", personId: "person_student_2025", birth: "2010.05.01", phone: "010-1111-2222" } } } },
        2026: { "2-3-6": { students: { third: { name: "이수인", personId: "person_student_2026", birth: "2010-05-01", phone: "010-9999-8888" } } } },
      },
      attendance: {}, semesters: {}, semestersPrivate: {}, retreats: {}, retreatsPrivate: {},
    };

    const results = searchPeople(buildPeopleProfiles(data), "이수인");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ kinds: ["student"], ambiguous: false });
    expect(results[0].records).toHaveLength(3);
  });

  it("생년월일이 같아도 부서가 다르거나 정상 진급이 아니면 연결하지 않는다", () => {
    const data: PeopleSearchData = {
      classes: {
        2024: { "1-1-1": { students: { first: { name: "진급확인", birth: "2010-05-01" } } } },
        2025: { "2-2-1": { students: { otherDepartment: { name: "진급확인", birth: "2010-05-01" } } } },
        2026: { "1-2-1": { students: { wrongGrade: { name: "진급확인", birth: "2010-05-01" } } } },
      },
      attendance: {}, semesters: {}, semestersPrivate: {}, retreats: {}, retreatsPrivate: {},
    };

    expect(searchPeople(buildPeopleProfiles(data), "진급확인")).toHaveLength(3);
  });

  it("같은 이름·생년월일 후보가 같은 연도에 둘이면 다른 연도 기록도 자동 연결하지 않는다", () => {
    const data: PeopleSearchData = {
      classes: {
        2025: {
          "1-2-1": { students: { first: { name: "중복후보", birth: "2010-05-01" } } },
          "1-2-2": { students: { second: { name: "중복후보", birth: "2010-05-01" } } },
        },
        2026: { "1-3-1": { students: { third: { name: "중복후보", birth: "2010-05-01" } } } },
      },
      attendance: {}, semesters: {}, semestersPrivate: {}, retreats: {}, retreatsPrivate: {},
    };

    expect(searchPeople(buildPeopleProfiles(data), "중복후보")).toHaveLength(3);
  });

  it("같은 연도에 학생 ID가 다르면 생년월일과 본인 연락처가 같아도 분리한다", () => {
    const data: PeopleSearchData = {
      classes: {
        2026: {
          "1-1-1": { students: { first: { name: "이동명", personId: "person_student_wrongly_shared", birth: "2011-01-02", phone: "010-2222-3333" } } },
          "1-1-2": { students: { second: { name: "이동명", personId: "person_student_wrongly_shared", birth: "2011-01-02", phone: "010-2222-3333" } } },
        },
      },
      attendance: {}, semesters: {}, semestersPrivate: {}, retreats: {}, retreatsPrivate: {},
    };

    expect(searchPeople(buildPeopleProfiles(data), "이동명")).toHaveLength(2);
  });

  it("영구 personId가 같으면 연도별 연락처가 달라져도 같은 유형의 기록을 연결한다", () => {
    const data: PeopleSearchData = {
      classes: {
        2025: { "1-2-1": { students: { old: { name: "전화변경", personId: "person_student_fixed", birth: "2010-01-02", phone: "010-1111-1111" } } } },
        2026: { "1-3-1": { students: { next: { name: "전화변경", personId: "person_student_fixed", birth: "2010-01-02", phone: "010-9999-9999" } } } },
      },
      attendance: {}, semesters: {}, semestersPrivate: {}, retreats: {}, retreatsPrivate: {},
    };

    expect(searchPeople(buildPeopleProfiles(data), "전화변경")).toHaveLength(1);
  });

  it("대표 이름은 최신 출석부 이름을 우선하고 수련회 순번 접두어는 표시에서 제거한다", () => {
    const data: PeopleSearchData = {
      classes: {
        2024: { "1-1-2": { students: { old: { name: "이예원", personId: "person_student_fixed", birth: "2010-01-02" } } } },
        2026: { "1-3-4": { students: { current: { name: "이예원", personId: "person_student_fixed", birth: "2010-01-02" } } } },
      },
      attendance: {}, semesters: {}, semestersPrivate: {}, retreatsPrivate: {},
      retreats: {
        winter: {
          name: "2026 겨울수련회", year: 2026,
          participants: { p1: { name: "134 이예원", studentId: "current", bu: "1부", grade: 3, class: 4 } },
        },
      },
    };

    const [result] = searchPeople(buildPeopleProfiles(data), "이예원");
    expect(result.name).toBe("이예원");
    expect(result.aliases).toEqual(["이예원"]);
    expect(result.records).toHaveLength(3);
  });

  it("교사와 스탭 명단은 personId가 같아도 유형이 다르면 분리한다", () => {
    const data: PeopleSearchData = {
      classes: {}, attendance: {}, semesters: {}, semestersPrivate: {}, retreats: {}, retreatsPrivate: {},
      teacherExtra: { 2026: { 1: { "1_1_1": { name: "박동일", personId: "person_teacher_fixed", phone: "010-3333-4444" } } } },
      teacherStaff: { 2026: { staff1: { name: "박동일", personId: "person_staff_fixed", phone: "010-3333-4444" } } },
    };

    const results = searchPeople(buildPeopleProfiles(data), "박동일");
    expect(results).toHaveLength(2);
    expect(results.map((profile) => profile.kinds[0]).sort()).toEqual(["staff", "teacher"]);
  });

  it("두 글자 미만 검색은 전체 명단을 노출하지 않는다", () => {
    expect(searchPeople(buildPeopleProfiles(fixture()), "강")).toEqual([]);
  });
});
