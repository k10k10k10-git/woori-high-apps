import { describe, expect, it } from "vitest";
import type { Participant } from "./types";
import { mergeParticipantContacts, splitParticipant, splitParticipants } from "./participantPrivacy";

const participant = (overrides: Partial<Participant> = {}): Participant => ({
  name: "김학생", gender: "남", grade: 1, class: 2, bu: "1부", registeredAt: "2026-01-01", ...overrides,
});

describe("수련회 참가자 공개·비공개 분리", () => {
  it("연락처는 공개 참가자에서 제거하고 비공개 값으로 분리한다", () => {
    const result = splitParticipant(participant({ phone: " 010-1111-2222 ", pPhone: "010-3333-4444" }));
    expect(result.publicValue).not.toHaveProperty("phone");
    expect(result.publicValue).not.toHaveProperty("pPhone");
    expect(result.privateValue).toEqual({ phone: "010-1111-2222", pPhone: "010-3333-4444" });
  });

  it("빈 연락처는 비공개 레코드를 만들지 않는다", () => {
    expect(splitParticipant(participant({ phone: " ", pPhone: null })).privateValue).toBeNull();
  });

  it("여러 참가자를 같은 키의 공개 명단과 비공개 연락처 맵으로 나눈다", () => {
    const result = splitParticipants({ p_0: participant({ phone: "010-1" }), p_1: participant({ name: "이학생" }) });
    expect(Object.keys(result.publicParticipants)).toEqual(["p_0", "p_1"]);
    expect(result.contacts).toEqual({ p_0: { phone: "010-1" } });
  });

  it("비공개 연락처가 레거시 공개 연락처보다 우선한다", () => {
    const merged = mergeParticipantContacts(
      { p_0: participant({ phone: "010-old", pPhone: "010-parent-old" }) },
      { p_0: { phone: "010-new" } },
    );
    expect(merged.p_0.phone).toBe("010-new");
    expect(merged.p_0.pPhone).toBe("010-parent-old");
  });
});
