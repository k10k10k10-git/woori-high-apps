import { describe, it, expect } from "vitest";
import { withError, withoutError, formatLoadErrors } from "./loadErrors";

const DENIED = "permission_denied at /semesters/2026-2/sessions: Client doesn't have permission to access the desired data.";

describe("loadErrors", () => {
  it("실패가 없으면 배너 문구가 없다", () => {
    expect(formatLoadErrors({})).toBeNull();
  });

  it("동시에 실패한 경로를 전부 나열한다 — 마지막 하나만 보이던 회귀 방지", () => {
    let map = withError({}, "회차", DENIED);
    map = withError(map, "신청 명단", DENIED);
    map = withError(map, "사역팀", DENIED);

    const message = formatLoadErrors(map);
    expect(message).toContain("회차");
    expect(message).toContain("신청 명단");
    expect(message).toContain("사역팀");
    expect(message).toContain(DENIED);
  });

  it("성공한 경로는 배너에서 빠지고, 전부 성공하면 배너가 사라진다", () => {
    let map = withError(withError({}, "회차", DENIED), "사역팀", DENIED);
    map = withoutError(map, "회차");
    expect(formatLoadErrors(map)).not.toContain("회차");

    map = withoutError(map, "사역팀");
    expect(formatLoadErrors(map)).toBeNull();
  });

  it("같은 실패가 반복되면 같은 객체를 돌려준다 (리렌더 방지)", () => {
    const first = withError({}, "회차", DENIED);
    expect(withError(first, "회차", DENIED)).toBe(first);
  });

  it("없는 키를 지우면 같은 객체를 돌려준다", () => {
    const map = withError({}, "회차", DENIED);
    expect(withoutError(map, "사역팀")).toBe(map);
  });
});
