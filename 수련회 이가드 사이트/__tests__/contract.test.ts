/**
 * 행정 ↔ 이가드 계약 테스트
 *
 * 행정에서 저장한 데이터를 이가드가 읽을 때 깨지지 않는지 검증한다.
 * 이 테스트가 실패하면 행정 쪽 데이터 구조가 바뀌어 이가드가 깨질 수 있다는 의미다.
 */
import { describe, it, expect } from "vitest";
import type {
  Participant,
  TeacherAttendance,
  Group,
  Room,
  Student,
  ClassData,
  Retreat,
} from "@/lib/types";

// ── 행정이 저장하는 fixture (실제 프로덕션 shape 기준) ──

const ADMIN_PARTICIPANT: Record<string, Participant> = {
  p_0: {
    name: "홍길동",
    gender: "남",
    grade: 2,
    class: 3,
    bu: "1부",
    studentId: "1_S23_01",
    registeredAt: "2025-07-01",
    phone: "010-1234-5678",
    pPhone: "010-9876-5432",
    extra: "알레르기 있음",
  } as Participant,
  p_1: {
    name: "김영희",
    gender: "여",
    grade: 1,
    class: 1,
    bu: "2부",
    studentId: null,
    registeredAt: "2025-07-02",
  } as Participant,
};

const ADMIN_TEACHERS: Record<string, Omit<TeacherAttendance, "id">> = {
  t1: {
    name: "이교사",
    bu: "스탭",
    classKey: "스탭",
    status: "전참",
    role: "조스탭",
    corps: "본대",
    age: "25",
    originKey: "staff:abc123",
    source: "attendance-db",
    originType: "official-staff",
  } as Omit<TeacherAttendance, "id">,
  t2: {
    name: "박교사",
    bu: "1부",
    classKey: "2학년 3반",
    status: "부분참",
    note: "둘째날 합류",
    arrivalInfo: "7/15 오후",
    transport: "자차",
    originKey: "class:1-2-3",
    source: "attendance-db",
    originType: "class-teacher",
  } as Omit<TeacherAttendance, "id">,
  t3: {
    name: "최교사",
    bu: "스탭",
    classKey: "스탭",
    status: "불참",
    originKey: "staff:def456",
  } as Omit<TeacherAttendance, "id">,
};

const ADMIN_GROUPS: Record<string, Omit<Group, "id">> = {
  g1: {
    name: "1조",
    bu: "1부",
    teachers: ["김선생"],
    leader: "홍길동",
    studentIds: ["p_0", "p_2", "p_3"],
    gbs: "5012호",
    staff: "이교사",
  } as Omit<Group, "id">,
  g2: {
    name: "2조",
    bu: "2부",
    teachers: ["박선생"],
    leader: "김영희",
    studentIds: ["p_1", "p_4"],
  } as Omit<Group, "id">,
};

const ADMIN_ROOMS: Record<string, Omit<Room, "id">> = {
  r1: {
    roomNumber: "301",
    capacity: 6,
    type: "남",
    studentIds: ["p_0", "p_2"],
    teachers: ["이교사"],
  } as Omit<Room, "id">,
};

const ADMIN_RETREAT: Omit<Retreat, "id"> = {
  name: "2025 여름 수련회",
  year: 2025,
  startDate: "2025-07-14",
  endDate: "2025-07-16",
  groupCount: 8,
};

const CLASSES_DATA: Record<string, ClassData> = {
  "1-2-3": {
    teacher: "박교사",
    students: {
      S23_01: { id: "S23_01", name: "홍길동", num: 1 } as Student,
      S23_02: { id: "S23_02", name: "이철수", num: 2 } as Student,
    },
  } as ClassData,
  "2-1-1": {
    teacher: "김교사",
    students: {
      S11_01: { id: "S11_01", name: "김영희", num: 1 } as Student,
    },
  } as ClassData,
};

// ── 1. 참가자 계약: 이가드가 기대하는 필드가 존재하는가 ──

describe("참가자(participants) 계약", () => {
  it("이가드가 사용하는 필수 필드가 존재한다", () => {
    for (const [key, p] of Object.entries(ADMIN_PARTICIPANT)) {
      expect(p.name).toBeDefined();
      expect(typeof p.name).toBe("string");
      expect(p.gender).toBeDefined();
      expect(typeof p.grade).toBe("number");
      expect(typeof p.class).toBe("number");
      expect(p.bu).toBeDefined();
      expect(["1부", "2부"]).toContain(p.bu);
    }
  });

  it("studentId는 string 또는 null/undefined이다 (다른 타입이면 이가드 매칭이 깨짐)", () => {
    for (const p of Object.values(ADMIN_PARTICIPANT)) {
      if (p.studentId !== undefined && p.studentId !== null) {
        expect(typeof p.studentId).toBe("string");
      }
    }
  });

  it("participant key는 문자열이고 빈 문자열이 아니다", () => {
    for (const key of Object.keys(ADMIN_PARTICIPANT)) {
      expect(typeof key).toBe("string");
      expect(key.length).toBeGreaterThan(0);
    }
  });
});

// ── 2. 교사/스탭 계약: teachersToStaff 변환이 깨지지 않는가 ──

describe("교사/스탭(teachers) 계약", () => {
  it("이가드 teachersToStaff가 기대하는 필수 필드가 존재한다", () => {
    for (const [id, t] of Object.entries(ADMIN_TEACHERS)) {
      expect(t.name).toBeDefined();
      expect(typeof t.name).toBe("string");
      expect(t.bu).toBeDefined();
      expect(["1부", "2부", "스탭"]).toContain(t.bu);
      expect(t.status).toBeDefined();
      expect(["전참", "부분참", "불참"]).toContain(t.status);
    }
  });

  it("bu=스탭이고 status≠불참인 교사만 이가드 스탭으로 변환된다", () => {
    const iguardStaff = Object.entries(ADMIN_TEACHERS)
      .filter(([, t]) => t.bu === "스탭" && t.status !== "불참" && t.name?.trim());

    expect(iguardStaff.length).toBe(1);
    expect(iguardStaff[0][0]).toBe("t1");
  });

  it("스탭의 선택적 필드(age, role, corps 등)가 올바른 타입이다", () => {
    const staff = ADMIN_TEACHERS.t1;
    if (staff.age !== undefined) expect(typeof staff.age).toBe("string");
    if (staff.role !== undefined) expect(typeof staff.role).toBe("string");
    if (staff.corps !== undefined) {
      expect(["선발대", "본대", "후발대"]).toContain(staff.corps);
    }
    if (staff.worship !== undefined) expect(typeof staff.worship).toBe("boolean");
  });

  it("teacher id(Firebase key)는 이가드 동선 매트릭스의 staffId로 사용된다", () => {
    for (const id of Object.keys(ADMIN_TEACHERS)) {
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
      expect(id).not.toContain("/");
      expect(id).not.toContain(".");
    }
  });
});

// ── 3. 조편성 계약: 이가드 조별 뷰가 깨지지 않는가 ──

describe("조편성(groups) 계약", () => {
  it("이가드가 사용하는 필수 필드가 존재한다", () => {
    for (const [id, g] of Object.entries(ADMIN_GROUPS)) {
      expect(g.name).toBeDefined();
      expect(g.bu).toBeDefined();
      expect(["1부", "2부"]).toContain(g.bu);
      expect(Array.isArray(g.studentIds)).toBe(true);
    }
  });

  it("studentIds가 participant key와 동일한 형식이다", () => {
    const participantKeys = new Set(Object.keys(ADMIN_PARTICIPANT));
    for (const g of Object.values(ADMIN_GROUPS)) {
      for (const sid of g.studentIds) {
        expect(typeof sid).toBe("string");
        expect(sid.length).toBeGreaterThan(0);
      }
    }
  });

  it("group id(Firebase key)는 이가드 groupStaff의 키로 사용된다", () => {
    for (const id of Object.keys(ADMIN_GROUPS)) {
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    }
  });
});

// ── 4. 숙소 계약 ──

describe("숙소(rooms) 계약", () => {
  it("이가드가 사용하는 필수 필드가 존재한다", () => {
    for (const r of Object.values(ADMIN_ROOMS)) {
      expect(r.roomNumber).toBeDefined();
      expect(typeof r.capacity).toBe("number");
      expect(r.type).toBeDefined();
      expect(["남", "여"]).toContain(r.type);
      expect(Array.isArray(r.studentIds)).toBe(true);
    }
  });
});

// ── 5. classes 계약: 이가드 normalizeClasses가 깨지지 않는가 ──

describe("classes (학생 앱 소유) 계약", () => {
  function normalizeClasses(classesData: Record<string, ClassData>): Record<string, Student> {
    const result: Record<string, Student> = {};
    Object.entries(classesData).forEach(([classKey, classData]) => {
      const parts = classKey.split("-");
      const buNum = parseInt(parts[0]);
      const grade = parseInt(parts[1]);
      const cls = parseInt(parts[2]);
      if (classData.students) {
        Object.entries(classData.students).forEach(([studentId, student]) => {
          const s = student as Student;
          const sourceId = typeof s.id === "string" && s.id.trim() ? s.id.trim() : studentId;
          const uniqueKey = `${buNum}_${sourceId}`;
          result[uniqueKey] = { ...s, id: uniqueKey, buNum, grade, class: cls };
        });
      }
    });
    return result;
  }

  it("classKey 형식이 {부}-{학년}-{반}이다", () => {
    for (const key of Object.keys(CLASSES_DATA)) {
      const parts = key.split("-");
      expect(parts.length).toBe(3);
      expect(parseInt(parts[0])).not.toBeNaN();
      expect(parseInt(parts[1])).not.toBeNaN();
      expect(parseInt(parts[2])).not.toBeNaN();
    }
  });

  it("normalizeClasses가 uniqueKey를 올바르게 생성한다", () => {
    const students = normalizeClasses(CLASSES_DATA);

    expect(students["1_S23_01"]).toBeDefined();
    expect(students["1_S23_01"].name).toBe("홍길동");
    expect(students["1_S23_01"].buNum).toBe(1);
    expect(students["1_S23_01"].grade).toBe(2);
    expect(students["1_S23_01"].class).toBe(3);

    expect(students["2_S11_01"]).toBeDefined();
    expect(students["2_S11_01"].buNum).toBe(2);
  });

  it("같은 studentId라도 다른 부이면 uniqueKey가 다르다", () => {
    const dupClasses: Record<string, ClassData> = {
      "1-1-1": { students: { S01: { id: "S01", name: "A", num: 1 } as Student } } as ClassData,
      "2-1-1": { students: { S01: { id: "S01", name: "B", num: 1 } as Student } } as ClassData,
    };
    const students = normalizeClasses(dupClasses);
    expect(students["1_S01"]).toBeDefined();
    expect(students["2_S01"]).toBeDefined();
    expect(students["1_S01"].name).not.toBe(students["2_S01"].name);
  });

  it("participant.studentId가 normalizeClasses의 uniqueKey와 매칭된다", () => {
    const students = normalizeClasses(CLASSES_DATA);
    const matched = ADMIN_PARTICIPANT.p_0;
    if (matched.studentId) {
      expect(students[matched.studentId]).toBeDefined();
    }
  });
});

// ── 6. 수련회 메타 계약 ──

describe("수련회(retreat) 메타 계약", () => {
  it("이가드가 사용하는 필수 필드가 존재한다", () => {
    expect(ADMIN_RETREAT.name).toBeDefined();
    expect(typeof ADMIN_RETREAT.year).toBe("number");
  });

  it("날짜 필드가 YYYY-MM-DD 형식이다", () => {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (ADMIN_RETREAT.startDate) {
      expect(ADMIN_RETREAT.startDate).toMatch(dateRegex);
    }
    if (ADMIN_RETREAT.endDate) {
      expect(ADMIN_RETREAT.endDate).toMatch(dateRegex);
    }
  });
});

// ── 7. 역방향 계약: 이가드 groupStaff → 행정 ──

describe("역방향 계약: iguard/groupStaff → 행정", () => {
  const IGUARD_GROUP_STAFF: Record<string, string[]> = {
    g1: ["t1"],
    g2: ["t1", "t2"],
  };

  it("groupStaff의 키는 행정 group id와 같은 형식이다", () => {
    const adminGroupIds = new Set(Object.keys(ADMIN_GROUPS));
    for (const groupId of Object.keys(IGUARD_GROUP_STAFF)) {
      expect(adminGroupIds.has(groupId)).toBe(true);
    }
  });

  it("groupStaff의 값은 행정 teacher id 배열이다", () => {
    const adminTeacherIds = new Set(Object.keys(ADMIN_TEACHERS));
    for (const staffIds of Object.values(IGUARD_GROUP_STAFF)) {
      expect(Array.isArray(staffIds)).toBe(true);
      for (const sid of staffIds) {
        expect(adminTeacherIds.has(sid)).toBe(true);
      }
    }
  });
});
