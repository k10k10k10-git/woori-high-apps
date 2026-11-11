/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDatabase, type RtdbDatabase } from "./database";
import { onValue, ref, set } from "./index";
import { FakeSupabase } from "./testing/fakeSupabase";

const databases: RtdbDatabase[] = [];
afterEach(() => databases.splice(0).forEach((db) => db._repo.dispose()));

describe("브라우저 환경 감시", () => {
  it("online 이벤트가 오면 재시도 간격을 기다리지 않고 쌓인 쓰기를 보낸다", async () => {
    const fake = new FakeSupabase({ a: 1 });
    // 브라우저 기본값(실시간·환경 감시 켜짐)을 쓰되 재시도 간격만 아주 길게 둔다.
    const db = createDatabase({ client: () => fake, refreshDelayMs: 0, retryDelayMs: () => 60_000 });
    databases.push(db);
    expect(fake.channels).toHaveLength(0);
    const states: unknown[] = [];
    onValue(ref(db, ".info/connected"), (snapshot) => states.push(snapshot.val()));
    expect(fake.channels).toHaveLength(1);
    fake.setRealtimeStatus("SUBSCRIBED");
    fake.online = false;
    let done = false;
    const writing = set(ref(db, "a"), 2).then(() => { done = true; });
    await vi.waitFor(() => expect(fake.callsOf("rtdb_update")).toHaveLength(1));
    window.dispatchEvent(new Event("offline"));
    await vi.waitFor(() => expect(states.at(-1)).toBe(false));
    expect(done).toBe(false);
    fake.online = true;
    window.dispatchEvent(new Event("online"));
    await writing;
    expect(fake.callsOf("rtdb_update")).toHaveLength(2);
    expect(fake.value("a")).toBe(2);
    expect(states.at(-1)).toBe(true);
  });
});
