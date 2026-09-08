import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { get, ref } = vi.hoisted(() => ({ get: vi.fn(), ref: vi.fn() }));
vi.mock("./firebaseAdmin", () => ({ getPraiseFirebaseAdmin: () => ({ database: { ref } }), praiseUnavailable: (code: string) => new Error(code) }));
import { praiseRoster } from "./roster";
import type { PraiseState } from "../types";
beforeEach(() => { vi.resetAllMocks(); ref.mockReturnValue({ get }); });
describe("인덱스 없는 운영 학기 명단 조회", () => {
 it("teamId 서버 쿼리 없이 학기 공개 신청을 읽고 검증한 공식 인물만 반환한다", async () => {
  get.mockResolvedValueOnce({val:()=>({"1_a":{studentId:"a",personId:"person_student_a",name:"합성",bu:"1부",grade:3,class:1,status:"배치",teamId:"praise"},"1_b":{studentId:"b",name:"다른팀",bu:"1부",grade:3,class:1,status:"배치",teamId:"other"}})}).mockResolvedValueOnce({val:()=>({name:"합성",personId:"person_student_a"})});
  const result=await praiseRoster({meta:{semesterId:"2026-2",teamId:"praise"}} as PraiseState);
  expect(result.people).toHaveLength(1); expect(result.people[0].rosterLink.personId).toBe("person_student_a");
  expect(ref.mock.calls.map(([path])=>path)).toEqual(["semesters/2026-2/applications","classes/2026/1-3-1/students/a"]);
 });
 it("읽기 실패를 빈 명단 성공으로 숨기지 않는다", async()=>{get.mockRejectedValue(new Error("network"));await expect(praiseRoster({meta:{semesterId:"2026-2",teamId:"praise"}} as PraiseState)).rejects.toThrow("roster_unavailable");});
});
