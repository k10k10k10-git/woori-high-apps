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
  combinedNote,
  parseBirth,
  registryErrorText,
  registryReadiness,
  skippedText,
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
    expect(buildRegistrySubmission({ ...ready, owner: " 가상 바나바 ", inviter: "친구", faithStep: "학습" },
      { birth: "2011-05-05", phone: "010-0000-0000", parentPhone: "010-1111-2222", churchFriend: "가상 지인", teamMemo: "가상 비고" }, 2027, "2027-03-20")).toEqual({
      nfId: ready.id, year: 2027, classKey: "1-1-3", name: "새친구", birthYear: 2011, birthDate: "2011-05-05", gender: "여",
      school: "가상고", firstVisitDate: "2027-03-07", birthYearEstimated: false, firstVisitClamped: false,
      barnabas: "가상 바나바", inviter: "친구", faithStep: "학습", churchFriend: "가상 지인", metFirstOn: "2027-03-07", metSecondOn: "2027-03-14",
      note: "비고: 가상 비고", studentPhone: "010-0000-0000", guardianPhone: "010-1111-2222",
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
  it("접수 조건(2026-11-14): 배정 반만 있으면 된다 — 1·2주차·등록 결정은 우리틴즈에서 이어서. '미등록'과 잘못된 값은 이유를 돌려준다", () => {
    expect(buildRegistrySubmission({ ...ready, decision: "미정", week1Date: undefined, week2Date: undefined }, {}, 2027, "2027-03-20")).toMatchObject({ metFirstOn: null, metSecondOn: null });
    expect(buildRegistrySubmission({ ...ready, decision: "보류" }, {}, 2027, "2027-03-20")).not.toHaveProperty("error");
    expect(buildRegistrySubmission({ ...ready, decision: "미등록" }, {}, 2027, "2027-03-20")).toHaveProperty("error");
    expect(registryReadiness({ ...ready, assignedClassKey: undefined })).toMatch(/배정 반/);
    expect(buildRegistrySubmission({ ...ready, assignedClassKey: "1-4-1" }, {}, 2027, "2027-03-20")).toHaveProperty("error");
    expect(buildRegistrySubmission({ ...ready, id: "bad.id" }, {}, 2027, "2027-03-20")).toHaveProperty("error");
    expect(buildRegistrySubmission({ ...ready, name: "가" }, {}, 2027, "2027-03-20")).toHaveProperty("error");
  });
});

describe("메모 합치기·옮기지 못한 칸", () => {
  it("비고·가족사항·교역자 심방을 이름을 붙여 한 메모로, 500자를 넘으면 자른다", () => {
    expect(combinedNote({})).toBeNull();
    expect(combinedNote({ teamMemo: " 가상 비고 ", pastoralNotes: "가상 심방" })).toBe("비고: 가상 비고\n교역자 심방: 가상 심방");
    const long = combinedNote({ familyNotes: "가".repeat(600) });
    expect(long?.length).toBe(500);
    expect(long?.endsWith("…")).toBe(true);
  });
  it("옮기지 못한 칸 이름을 한국어로", () => {
    expect(skippedText([])).toBe("");
    expect(skippedText(["guardian_phone", "faith_step"])).toMatch(/보호자 연락처, 신급/);
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
    const base = {
      p_nf_id: ready.id, p_year: 2027, p_class_key: "1-1-3", p_name: "새친구", p_birth_year: 2011, p_birth_date: null,
      p_gender: "여", p_school: "가상고", p_first_visit_date: "2027-03-07", p_birth_year_estimated: true,
    };
    rpc.mockResolvedValueOnce({ data: { stage: "submitted", skipped: [] }, error: null });
    await expect(submitNewFriendToRegistry(input)).resolves.toEqual({ stage: "submitted", skipped: [] });
    expect(rpc).toHaveBeenCalledWith("hs_newcomer_submit_full", {
      ...base, p_barnabas: null, p_inviter: null, p_faith_step: null, p_church_friend: null, p_met_first_on: "2027-03-07", p_met_second_on: "2027-03-14",
      p_note: null, p_student_phone: null, p_guardian_phone: null, p_guardian_relation: null,
    });
    // 0093 적용 전 DB: 새 함수가 없으면 예전 함수로 기본 칸만
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Could not find the function api.hs_newcomer_submit_full" } });
    rpc.mockResolvedValueOnce({ data: { stage: "submitted" }, error: null });
    await expect(submitNewFriendToRegistry(input)).resolves.toEqual({ stage: "submitted" });
    expect(rpc).toHaveBeenLastCalledWith("hs_newcomer_submit", base);
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
