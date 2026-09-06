import { describe, expect, it } from "vitest";
import { rootPatchForUpdate, summarizeWrite, validateWritePath } from "./writeModel";

describe("활동 기록 경로와 표시 요약", () => {
  it("서로 인접하지 않은 상위·하위 경로도 거부하고 형제 접두사는 허용한다", () => {
    expect(() => rootPatchForUpdate("", { "semesters/a": {}, "semesters/a-b": {}, "semesters/a/c": true })).toThrow("상위 경로");
    expect(rootPatchForUpdate("semesters/a", { name: "합성", names: [] })).toEqual({ "semesters/a/name": "합성", "semesters/a/names": [] });
  });

  it.each(["", "/semesters/a", "semesters/a/", "semesters//a", "semesters/a/.value", "activityLogs/events/id"])("비정상 경로 %s를 거부한다", (path) => {
    expect(() => validateWritePath(path)).toThrow();
  });

  it("원장 값과 서버 sentinel 객체를 그대로 유지한다", () => {
    const value = Object.freeze({ names: Object.freeze(["합성"]), at: Object.freeze({ ".sv": "timestamp" }) });
    const patch = rootPatchForUpdate("semesters/a", { meta: value });
    expect(patch["semesters/a/meta"]).toBe(value);
    expect(rootPatchForUpdate("semesters/a", {})).toEqual({});
  });

  it("빈 객체 저장도 Firebase에서 사라질 빈 배열 대신 유효한 필드 요약을 남긴다", async () => {
    const summary = await summarizeWrite({ "semesters/s1/meta": {} }, "update");
    expect(summary?.changes).toEqual([{ field: "기록 값", redacted: true }]);
    expect(summary?.changedCount).toBe(1);
  });

  it("출석은 저장한 상태만 표시하고 이전값과 payload 작성자·시각은 복제하지 않는다", async () => {
    const summary = await summarizeWrite({ "semesters/2026-2/attendance/team/s1/a1": { s: "출석", by: "untrusted-author", at: 123 } }, "update");
    expect(summary?.area).toBe("attendance");
    expect(summary?.changes).toContainEqual({ field: "저장된 출석 상태", after: "출석" });
    expect(JSON.stringify(summary)).not.toContain("before");
    expect(JSON.stringify(summary)).not.toContain("untrusted-author");
    expect(summary?.target.href).toBe("/semester/2026-2");
  });

  it("출석 s 하위값 저장도 인식하고 임의 상태값은 가린다", async () => {
    const good = await summarizeWrite({ "semesters/2026-2/attendance/training/s1/a1/s": "결석" }, "update");
    const bad = await summarizeWrite({ "semesters/2026-2/attendance/training/s1/a1/s": "민감한 임의 문자열" }, "update");
    expect(good?.target.label).toBe("훈련 출석");
    expect(good?.changes[0].after).toBe("결석");
    expect(JSON.stringify(bad)).not.toContain("민감한 임의 문자열");
  });

  it("원장 객체가 직접 소유하지 않은 출석값을 실제 제출값으로 기록하지 않는다", async () => {
    const value = Object.assign(Object.create({ s: "출석" }), { by: "합성" });
    const summary = await summarizeWrite({ "semesters/s1/attendance/team/session1/a1": value }, "update");
    expect(summary?.changes.some((change) => change.after !== undefined)).toBe(false);
  });

  it("민감값·알 수 없는 키와 Object prototype 키를 고정 필드명으로 가린다", async () => {
    const value = JSON.parse('{"phone":"010-9999-8888","notes":"비공개 원문","constructor":"위험","toString":"값","비밀필드명":"본문"}');
    const summary = await summarizeWrite({ "retreatsPrivate/r1/participantContacts/p1": value }, "update");
    expect(summary?.changes).toEqual([{ field: "본인 연락처", redacted: true }, { field: "메모", redacted: true }, { field: "기타 항목", redacted: true }]);
    for (const raw of ["010-9999-8888", "비공개 원문", "constructor", "toString", "비밀필드명"]) expect(JSON.stringify(summary)).not.toContain(raw);
  });

  it("127개 대상은 30개 요약과 추가 건수로 제한한다", async () => {
    const patch = Object.fromEntries(Array.from({ length: 127 }, (_, index) => [`semesters/s1/applications/a${index}`, { name: `민감한 이름 ${index}`, note: "민감 메모" }]));
    const summary = await summarizeWrite(patch, "update");
    expect(summary?.changes).toHaveLength(30);
    expect(summary?.changedCount).toBe(127);
    expect(summary?.target.context).toContain("추가 97개");
    expect(JSON.stringify(summary)).not.toContain("민감");
  });

  it("여러 대상의 표시 필드에는 내부 식별자를 넣지 않는다", async () => {
    const summary = await summarizeWrite({
      "semesters/2026-sunday/newFriends/friend-a": { name: "가상 학생", part: "1부", gender: "남" },
      "semestersPrivate/2026-sunday/newFriendsPrivate/friend-a": { birth: "2009-01-01", phone: "010-0000-0000", parentPhone: "010-0000-0000" },
    }, "update");
    expect(summary?.changes).toEqual([
      { field: "새친구 · 이름·부서·성별", redacted: true },
      { field: "새친구 비공개 정보 · 생년월일·본인 연락처·보호자 연락처", redacted: true },
    ]);
    expect(JSON.stringify(summary?.changes)).not.toContain("friend-a");
  });

  it("동일 대상의 필드 쓰기는 하나의 대상으로 합친다", async () => {
    const summary = await summarizeWrite({ "semesters/s1/applications/a1/name": "합성", "semesters/s1/applications/a1/school": "합성학교" }, "update");
    expect(summary?.target.path).toBe("semesters/s1/applications/a1");
    expect(summary?.changes).toEqual([{ field: "이름", redacted: true }, { field: "학교", redacted: true }]);
  });

  it("백업과 알림 확인만 있는 저장은 표시 기록을 만들지 않는다", async () => {
    expect(await summarizeWrite({ "retreats/r1/participantsBackups/123": { secret: "백업" } }, "update")).toBeNull();
    expect(await summarizeWrite({ "iguardPending/u1/siteRequests/r1/notifiedAt": 123 }, "update")).toBeNull();
    const mixed = await summarizeWrite({ "iguardPending/u1/siteRequests/r1/notifiedAt": 123, "iguardPending/u1/siteRequests/r1/status": "resolved" }, "update");
    expect(mixed?.changes).toEqual([{ field: "상태", redacted: true }]);
  });

  it("긴 식별자·전화번호·자유텍스트 경로를 해시하고 표시 길이를 제한한다", async () => {
    const summary = await summarizeWrite({ [`retreats/${"x".repeat(700)}/participants/010-9999-8888`]: { name: "비공개" } }, "update");
    expect(summary?.target.path).toMatch(/^retreats\/id_[a-f0-9]{16}\/participants\/id_[a-f0-9]{16}$/);
    expect(summary?.target.path.length).toBeLessThanOrEqual(1024);
    expect(summary?.target.context?.length).toBeLessThanOrEqual(160);
    expect(summary?.target.href).toBeUndefined();
    const raw = await summarizeWrite({ "retreats/r1/participants/김학생": null }, "delete");
    expect(JSON.stringify(raw)).not.toContain("김학생");
  });

  it("자기 접근 요청의 서명된 UID만 원문으로 보존한다", async () => {
    const uid = "requester_123456789_" + "x".repeat(90);
    const own = await summarizeWrite({ [`iguardPending/${uid}`]: { name: "가입자" } }, "update", { actorUid: uid });
    expect(own?.target.path).toBe(`iguardPending/${uid}`);
    const other = await summarizeWrite({ [`retreatPending/${uid}`]: { name: "가입자" } }, "update", { actorUid: "other" });
    expect(other?.target.path).toMatch(/^retreatPending\/id_/);
  });

  it("화면 참고 이름과 실제 ISO 날짜만 표시하며 삭제에도 적용한다", async () => {
    const summary = await summarizeWrite({ "semesters/s1/attendance/team/session1/a1": null }, "delete", { context: { subjectName: "테스트 학생", date: "2026-09-05" } });
    expect(summary?.target.label).toBe("사역팀 출석 · 테스트 학생");
    expect(summary?.target.context).toBe("s1 · 2026-09-05");
    expect(summary?.action).toBe("delete");
    const unsafe = await summarizeWrite({ "semesters/s1/attendance/team/session1/a1": null }, "delete", { context: { subjectName: "010-9999-8888", date: "2026-02-30" } });
    expect(JSON.stringify(unsafe)).not.toContain("010-9999-8888");
    expect(JSON.stringify(unsafe)).not.toContain("2026-02-30");
  });
});
