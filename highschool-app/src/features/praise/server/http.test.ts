import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { praiseHttp, praiseJson } from "./http";
import { PraiseDomainError } from "./validation";
import { PraiseRequestError } from "./supabaseAdmin";

const request = (body = "{}", headers: Record<string,string> = {}) => new Request("https://ministry.example/api/praise", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body });
describe("찬양팀 HTTP 저장 경계", () => {
  it("JSON과 같은 출처 요청을 허용한다", async () => { expect(await praiseJson(request('{"name":"합성"}', { origin: "https://ministry.example" }))).toEqual({name:"합성"}); });
  it.each([["origin","https://other.example"],["sec-fetch-site","cross-site"]])("다른 사이트의 저장을 차단한다", async (key,value) => { await expect(praiseJson(request("{}",{[key]:value}))).rejects.toMatchObject({status:403}); });
  it("MIME과 잘못된 JSON을 거절한다", async () => {
    await expect(praiseJson(request("{}", {"content-type":"text/plain"}))).rejects.toMatchObject({status:415});
    await expect(praiseJson(request("{"))).rejects.toMatchObject({status:400});
  });
  it("길이 헤더가 없거나 거짓이어도 실제 본문 상한을 지킨다", async () => {
    await expect(praiseJson(request('"'+"a".repeat(1_500_001)+'"', {"content-length":"2"}))).rejects.toMatchObject({status:413});
  });
  it("도메인 오류는 회복 안내를 보존하고 내부 오류는 숨긴다", async () => {
    const response = await praiseHttp(async()=>{throw new PraiseDomainError(409,"최신 기록 확인","revision_conflict");});
    expect(response.status).toBe(409);expect(await response.json()).toEqual({error:"최신 기록 확인",code:"revision_conflict"});
    const failed = await praiseHttp(async()=>{throw new Error("private-key-or-db-body");});
    expect(await failed.text()).not.toContain("private-key");expect(failed.headers.get("cache-control")).toContain("no-store");
    expect((await praiseHttp(async()=>{throw new PraiseRequestError(401,"재로그인","unauthorized");})).status).toBe(401);
  });
});
