import { describe, it, expect } from "vitest";
import { buildApplicationPrivateUpdates } from "./applicationPrivate";

describe("buildApplicationPrivateUpdates", () => {
  it("연락처를 모두 비우면 null로 지운다 — 예전엔 쓰기를 건너뛰어 옛 값이 남았다", () => {
    expect(buildApplicationPrivateUpdates({ phone: "", parentPhone: "" })).toEqual({
      phone: null,
      parentPhone: null,
    });
  });

  it("값이 있으면 그대로 저장하고 공백은 다듬는다", () => {
    expect(buildApplicationPrivateUpdates({ phone: " 010-1234-5678 ", motive: "성장하고 싶어요" })).toEqual({
      phone: "010-1234-5678",
      motive: "성장하고 싶어요",
    });
  });

  it("공백만 있는 값도 지운다", () => {
    expect(buildApplicationPrivateUpdates({ parentPhone: "   " })).toEqual({ parentPhone: null });
  });

  it("일부만 비우면 나머지는 유지된다", () => {
    expect(buildApplicationPrivateUpdates({ phone: "010-0000-0000", parentPhone: "" })).toEqual({
      phone: "010-0000-0000",
      parentPhone: null,
    });
  });

  it("빈 객체는 빈 payload를 만든다 (update no-op)", () => {
    expect(buildApplicationPrivateUpdates({})).toEqual({});
  });
});
