import { describe, expect, it } from "vitest";
import { activityRangeBounds, defaultActivityLogRange, parseActivityLogRecord } from "./model";

const record = () => ({
  id: "event-1", schemaVersion: 1, occurredAt: 1_788_660_000_000, recordedAt: 1_788_660_000_100,
  actor: { kind: "user", uid: "account-1", name: "검증 계정" },
  area: "attendance", action: "update",
  target: { path: "semesters/example/attendance/team/session/student", label: "검증 학생", href: "/semester/example" },
  changes: [{ field: "출석 상태", before: "미기록", after: "출석" }], changedCount: 1,
});

describe("활동 로그 날짜 범위", () => {
  it("UTC 날짜가 같아도 한국 자정을 지나면 오늘을 바꾼다", () => {
    expect(defaultActivityLogRange(Date.parse("2026-09-05T15:00:00Z"))).toEqual({ from: "2026-08-31", to: "2026-09-06" });
    expect(defaultActivityLogRange(Date.parse("2026-09-05T14:59:59Z")).to).toBe("2026-09-05");
  });
  it("양 끝 날짜를 한국 시간 하루 전체로 포함한다", () => {
    expect(activityRangeBounds({ from: "2026-09-01", to: "2026-09-01" })).toEqual({
      from: Date.parse("2026-08-31T15:00:00Z"), to: Date.parse("2026-09-01T14:59:59.999Z"),
    });
  });
  it("31일은 허용하고 32일, 역전, 존재하지 않는 날짜는 거부한다", () => {
    expect(() => activityRangeBounds({ from: "2026-01-01", to: "2026-01-31" })).not.toThrow();
    for (const range of [
      { from: "2026-01-01", to: "2026-02-01" },
      { from: "2026-09-06", to: "2026-09-05" },
      { from: "2026-02-30", to: "2026-03-01" },
      { from: "", to: "2026-03-01" },
    ]) expect(() => activityRangeBounds(range)).toThrow();
  });
});

describe("활동 로그 읽기 계약", () => {
  it("서버 계약을 보존하고 알 수 없는 민감 필드는 복사하지 않는다", () => {
    expect(parseActivityLogRecord({ ...record(), secret: "원문" })).toEqual(record());
  });
  it("가림 표시가 있으면 잘못 섞인 이전/이후 원문도 반환하지 않는다", () => {
    const parsed = parseActivityLogRecord({ ...record(), changes: { "0": { field: "연락처", redacted: true, before: "비공개", after: "비공개 수정" } } });
    expect(parsed?.changes).toEqual([{ field: "연락처", redacted: true }]);
  });
  it("시스템 이벤트에 들어 있는 임의 UID를 인증 사용자로 내보내지 않는다", () => {
    expect(parseActivityLogRecord({ ...record(), actor: { kind: "system", uid: "claimed-user" } })?.actor).toEqual({ kind: "system" });
  });
  it.each(["javascript:alert(1)", "//outside.example", "/semester\\outside", "/semester/\nexample", "https://outside.example"])("외부·비정상 링크를 제거한다: %s", (href) => {
    expect(parseActivityLogRecord({ ...record(), target: { ...record().target, href } })?.target.href).toBeUndefined();
  });
  it.each([
    { schemaVersion: 2 }, { area: "toString" }, { area: "unrecognized" }, { action: "execute" },
    { actor: { kind: "user" } }, { occurredAt: NaN }, { occurredAt: 1e100 }, { id: "bad/id" }, { changes: [{ field: "내용", after: { raw: "원문" } }] },
  ])("알 수 없는 계약과 손상된 필드를 거부한다: %j", (patch) => {
    expect(parseActivityLogRecord({ ...record(), ...patch })).toBeNull();
  });
});
