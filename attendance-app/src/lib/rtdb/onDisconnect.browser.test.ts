/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDatabase, type RtdbDatabase } from "./database";
import { onDisconnect, ref } from "./index";
import { keepaliveTransport, setDisconnectTransport, type DisconnectTransport } from "./onDisconnect";
import { FakeSupabase } from "./testing/fakeSupabase";

const databases: RtdbDatabase[] = [];
afterEach(() => {
  databases.splice(0).forEach((db) => db._repo.dispose());
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function setup(token: string | null = "session-token") {
  const fake = new FakeSupabase({
    config: { studentMoveLocks: { 2026: {
      "1-1-1": { me: { op1: { phase: "preparing" } }, other: { op9: { phase: "pending" } } },
      "1-1-2": { me: { op1: { phase: "preparing" } } },
    } } },
  });
  const db = createDatabase({ client: () => fake, realtime: false, watchEnvironment: false });
  databases.push(db);
  const sent: Array<{ patch: Record<string, unknown>; token: string }> = [];
  const transport: DisconnectTransport = {
    accessToken: async () => token,
    // 페이지가 닫힐 때 실제로 서버(가짜)에 rtdb_update 를 보낸 것처럼 적용한다.
    send: (patch, accessToken) => {
      sent.push({ patch, token: accessToken });
      void fake.schema("api").rpc("rtdb_update", { p_patch: patch });
    },
  };
  const registry = setDisconnectTransport(db._repo, transport);
  return { fake, db, sent, registry };
}

const closePage = () => window.dispatchEvent(new Event("pagehide"));

describe("onDisconnect: 페이지가 닫힐 때 한 번 보내는 연결 끊김 예약", () => {
  it("학생 이동처럼 연도 잠금에 두 leaf 를 update 로 예약하면, 닫힐 때 그 둘만 지우고 다른 사람 잠금은 남긴다", async () => {
    const { fake, db, sent } = setup();
    await onDisconnect(ref(db, "config/studentMoveLocks/2026")).update({ "1-1-1/me/op1": null, "1-1-2/me/op1": null });
    expect(sent).toEqual([]);
    closePage();
    expect(sent).toEqual([{ patch: { "config/studentMoveLocks/2026/1-1-1/me/op1": null, "config/studentMoveLocks/2026/1-1-2/me/op1": null }, token: "session-token" }]);
    await vi.waitFor(() => expect(fake.value("config/studentMoveLocks/2026")).toEqual({ "1-1-1": { other: { op9: { phase: "pending" } } } }));
    // 보낸 예약은 소비된다 — 다시 닫혀도(뒤로 가기 캐시에서 돌아온 뒤) 또 보내지 않는다.
    closePage();
    expect(sent).toHaveLength(1);
  });

  it("leaf 경로마다 cancel 하면 부모에 update 로 건 예약도 그 leaf 만 취소된다(Firebase 와 같다)", async () => {
    const { db, registry, sent } = setup();
    await onDisconnect(ref(db, "locks")).update({ "a/me/op": null, "b/me/op": null, "c/me/op": null });
    await Promise.all(["locks/a/me/op", "locks/b/me/op"].map((path) => onDisconnect(ref(db, path)).cancel()));
    expect(registry._entries).toEqual({ "locks/c/me/op": null });
    await onDisconnect(ref(db, "locks")).cancel();
    expect(registry._entries).toEqual({});
    closePage();
    expect(sent).toEqual([]);
  });

  it("조상에 set 한 값 안의 자식을 cancel 하면 나머지 자식만 남긴다", async () => {
    const { db, registry } = setup();
    await onDisconnect(ref(db, "presence")).set({ a: 1, b: { c: 2, d: 3 } });
    await onDisconnect(ref(db, "presence/b/c")).cancel();
    expect(registry._entries).toEqual({ "presence/a": 1, "presence/b/d": 3 });
    await onDisconnect(ref(db, "presence/a/x")).cancel();
    expect(registry._entries).toEqual({ "presence/a": 1, "presence/b/d": 3 });
  });

  it("조상 예약 안의 자식을 다시 예약하면 조상 값 안에서 바꾸고, 자손 예약은 새 조상 예약이 덮는다", async () => {
    const { db, registry } = setup();
    await onDisconnect(ref(db, "p")).set({ a: 1 });
    await onDisconnect(ref(db, "p/b")).set(2);
    expect(registry._entries).toEqual({ p: { a: 1, b: 2 } });
    await onDisconnect(ref(db, "q/x")).set(1);
    await onDisconnect(ref(db, "q/y")).remove();
    await onDisconnect(ref(db, "q")).set([7, 8]);
    expect(registry._entries).toEqual({ p: { a: 1, b: 2 }, q: { 0: 7, 1: 8 } });
  });

  it("부른 순서대로 처리한다 — 등록을 기다리지 않고 곧바로 취소해도 예약이 남지 않는다", async () => {
    const { db, registry } = setup();
    const registering = onDisconnect(ref(db, "locks")).update({ "a/me/op": null });
    const cancelling = onDisconnect(ref(db, "locks/a/me/op")).cancel();
    await Promise.all([registering, cancelling]);
    expect(registry._entries).toEqual({});
  });

  it("로그인 세션이 없으면 등록이 PERMISSION_DENIED 로 실패하고 아무것도 보내지 않는다", async () => {
    const { db, sent, registry } = setup(null);
    await expect(onDisconnect(ref(db, "locks")).update({ "a/me/op": null })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(registry._entries).toEqual({});
    closePage();
    expect(sent).toEqual([]);
  });

  it("Firebase 처럼 잘못된 값·.info 경로는 바로 예외", () => {
    const { db } = setup();
    expect(() => onDisconnect(ref(db, ".info/connected"))).toThrow(/\.info/);
    expect(() => onDisconnect(ref(db, "a")).set(undefined)).toThrow(/undefined/);
    expect(() => onDisconnect(ref(db, "a")).update({ b: 1, "b/c": 2 })).toThrow(/ancestor/);
  });
});

describe("keepaliveTransport: 닫히는 페이지에서 보내는 요청", () => {
  it("PostgREST rtdb_update 로 keepalive POST 를 보낸다(api 스키마, 세션 토큰)", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co/");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_fake");
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    keepaliveTransport.send({ "locks/a": null }, "access-token");
    expect(fetch).toHaveBeenCalledExactlyOnceWith("https://example.supabase.co/rest/v1/rpc/rtdb_update", {
      method: "POST",
      keepalive: true,
      headers: { apikey: "sb_publishable_fake", Authorization: "Bearer access-token", "Content-Type": "application/json", "Content-Profile": "api" },
      body: JSON.stringify({ p_patch: { "locks/a": null } }),
    });
  });

  it("공개 설정이 없으면 보내지도, 토큰을 얻지도 않는다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    keepaliveTransport.send({ a: null }, "token");
    expect(fetch).not.toHaveBeenCalled();
    await expect(keepaliveTransport.accessToken()).resolves.toBeNull();
  });
});
