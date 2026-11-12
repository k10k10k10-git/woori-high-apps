import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ schema: () => ({ rpc }) }) }));

import {
  buildRegistrySubmission,
  canSendToRegistry,
  defaultLedger,
  deriveRegistryProgress,
  fetchRegistryStates,
  fetchYearLedger,
  parseBirth,
  registryErrorText,
  submitNewFriendToRegistry,
} from "./registryBridge";
import type { NewFriend } from "./types";

const ready: NewFriend = {
  id: "1730000000000_abcde", name: " 새친구 ", part: "1부", gender: "여", school: " 가상고 ", grade: 1, decision: "등록",
  week1Date: "2027-03-07", week2Date: "2027-03-14", registeredDate: "2027-03-07", assignedClassKey: "1-1-3",
  createdAt: "2027-03-07T00:00:00Z",
};

beforeEach(() => rpc.mockReset());

describe("parseBirth", () => {
  it("여러 모양의 생년월일을 날짜와 연도로 읽는다", () => {
    expect(parseBirth("2011-05-05", 2027)).toEqual({ date: "2011-05-05", year: 2011 });
    expect(parseBirth("2011.5.5", 2027)).toEqual({ date: "2011-05-05", year: 2011 });
    expect(parseBirth("2011년 5월 5일", 2027)).toEqual({ date: "2011-05-05", year: 2011 });
    expect(parseBirth("20110505", 2027)).toEqual({ date: "2011-05-05", year: 2011 });
    expect(parseBirth("110505", 2027)).toEqual({ date: "2011-05-05", year: 2011 });
    expect(parseBirth("990505", 2027)).toEqual({ date: "1999-05-05", year: 1999 });
    expect(parseBirth("2011", 2027)).toEqual({ year: 2011 });
  });
  it("없는 날짜와 알 수 없는 글자는 비운다", () => {
    expect(parseBirth("2011-02-30", 2027)).toEqual({});
    expect(parseBirth("모름", 2027)).toEqual({});
    expect(parseBirth(undefined, 2027)).toEqual({});
  });
});

describe("buildRegistrySubmission", () => {
  it("교적 접수 값: 이름·학교를 다듬고, 생년월일이 있으면 그 연도를 쓴다", () => {
    expect(buildRegistrySubmission(ready, { birth: "2011-05-05", phone: "010-0000-0000" }, 2027, "2027-03-20")).toEqual({
      nfId: ready.id, year: 2027, classKey: "1-1-3", name: "새친구", birthYear: 2011, birthDate: "2011-05-05", gender: "여",
      school: "가상고", firstVisitDate: "2027-03-07", birthYearEstimated: false, firstVisitClamped: false,
    });
  });
  it("생년월일이 없으면 학년으로 출생연도를 짐작하고 알린다(2027 고2 → 2010)", () => {
    const out = buildRegistrySubmission({ ...ready, grade: 2 }, {}, 2027, "2027-03-20");
    expect(out).toMatchObject({ birthYear: 2010, birthDate: null, birthYearEstimated: true });
  });
  it("지난해 등록일은 그 해 1월 1일로, 앞으로 올 날은 오늘로 고치고 알린다", () => {
    expect(buildRegistrySubmission({ ...ready, registeredDate: "2026-12-27" }, {}, 2027, "2027-01-10"))
      .toMatchObject({ firstVisitDate: "2027-01-01", firstVisitClamped: true });
    expect(buildRegistrySubmission({ ...ready, registeredDate: "2027-04-01" }, {}, 2027, "2027-03-20"))
      .toMatchObject({ firstVisitDate: "2027-03-20", firstVisitClamped: true });
  });
  it("접수 조건은 옛 출석부 반영과 같고, 보낼 수 없는 값은 이유를 돌려준다", () => {
    expect(buildRegistrySubmission({ ...ready, decision: "보류" }, {}, 2027, "2027-03-20")).toHaveProperty("error");
    expect(buildRegistrySubmission({ ...ready, assignedClassKey: "1-4-1" }, {}, 2027, "2027-03-20")).toHaveProperty("error");
    expect(buildRegistrySubmission({ ...ready, id: "bad.id" }, {}, 2027, "2027-03-20")).toHaveProperty("error");
    expect(buildRegistrySubmission({ ...ready, name: "가" }, {}, 2027, "2027-03-20")).toHaveProperty("error");
  });
});

describe("진행 상태·다시 보내기", () => {
  it("교적 등록 = 완료, 접수 = 처리중, 그 밖은 옛 출석부 반영 흔적을 무시한 판정", () => {
    expect(deriveRegistryProgress(ready, { stage: "registered" })).toBe("완료");
    expect(deriveRegistryProgress(ready, { stage: "submitted" })).toBe("처리중");
    expect(deriveRegistryProgress({ ...ready, giftDate: "2027-03-01" }, { stage: "none" })).toBe("처리중");
    expect(deriveRegistryProgress({ ...ready, decision: "미정", assignedClassKey: undefined, week2Date: undefined }, undefined)).toBe("대기");
  });
  it("보내지 않음·취소·교적에서 정리됨만 다시 보낼 수 있다", () => {
    expect([undefined, "none", "cancelled", "dismissed", "submitted", "registered"].map((stage) =>
      canSendToRegistry(stage ? { stage: stage as never } : undefined))).toEqual([true, true, true, true, false, false]);
  });
});

describe("RPC", () => {
  it("연도 원장: DB 값을 쓰고, 연결이 실패하면 2026까지만 legacy 로 둔다", async () => {
    rpc.mockResolvedValueOnce({ data: { year: 2027, ledger: "wooriteens" }, error: null });
    await expect(fetchYearLedger(2027)).resolves.toBe("wooriteens");
    expect(rpc).toHaveBeenCalledWith("hs_year_mode", { p_year: 2027 });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "network" } });
    await expect(fetchYearLedger(2026)).resolves.toBe("legacy");
    rpc.mockResolvedValueOnce({ data: null, error: { message: "network" } });
    await expect(fetchYearLedger(2027)).rejects.toThrow();
    expect([defaultLedger(2026), defaultLedger(2027)]).toEqual(["legacy", "wooriteens"]);
  });
  it("접수는 서버 인자 이름 그대로 보내고, 서버 오류를 한국어로 바꾼다", async () => {
    const input = buildRegistrySubmission(ready, {}, 2027, "2027-03-20");
    if ("error" in input) throw new Error(input.error);
    rpc.mockResolvedValueOnce({ data: { stage: "submitted" }, error: null });
    await expect(submitNewFriendToRegistry(input)).resolves.toEqual({ stage: "submitted" });
    expect(rpc).toHaveBeenCalledWith("hs_newcomer_submit", {
      p_nf_id: ready.id, p_year: 2027, p_class_key: "1-1-3", p_name: "새친구", p_birth_year: 2011, p_birth_date: null,
      p_gender: "여", p_school: "가상고", p_first_visit_date: "2027-03-07", p_birth_year_estimated: true,
    });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "class not found" } });
    await expect(submitNewFriendToRegistry(input)).rejects.toThrow(/반 편성/);
    expect(registryErrorText("unexpected")).toMatch(/실패/);
  });
  it("단계 조회는 모양이 맞는 id 만, 500개씩 나눠 묻는다", async () => {
    rpc.mockImplementation(async (_fn: string, args?: { p_nf_ids: string[] }) => ({
      data: Object.fromEntries((args?.p_nf_ids ?? []).map((id) => [id, { stage: "none" }])), error: null,
    }));
    const ids = Array.from({ length: 501 }, (_, i) => `id${i}`);
    const out = await fetchRegistryStates([...ids, "bad id", "id0"]);
    expect(Object.keys(out)).toHaveLength(501);
    const calls = rpc.mock.calls.filter((call) => call[0] === "hs_newcomer_status").map((call) => (call[1] as { p_nf_ids: string[] }).p_nf_ids.length);
    expect(calls).toEqual([500, 1]);
  });
});
