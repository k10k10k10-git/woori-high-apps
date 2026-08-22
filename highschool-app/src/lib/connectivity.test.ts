import { describe, expect, it } from "vitest";
import {
  INITIAL_CONNECTIVITY_BANNER_STATE,
  reduceConnectivityBanner,
} from "./connectivity";

describe("reduceConnectivityBanner", () => {
  it("초기 Firebase 연결 중의 false는 유예 시간 동안 숨긴다", () => {
    const state = reduceConnectivityBanner(INITIAL_CONNECTIVITY_BANNER_STATE, {
      type: "connection-changed",
      connected: false,
    });

    expect(state.mode).toBe("hidden");
    expect(state.connected).toBe(false);
  });

  it("유예 시간 안에 Firebase가 연결되면 오프라인 배너를 표시하지 않는다", () => {
    const disconnected = reduceConnectivityBanner(INITIAL_CONNECTIVITY_BANNER_STATE, {
      type: "connection-changed",
      connected: false,
    });
    const connected = reduceConnectivityBanner(disconnected, {
      type: "connection-changed",
      connected: true,
    });
    const afterGrace = reduceConnectivityBanner(connected, { type: "grace-elapsed" });

    expect(afterGrace.mode).toBe("hidden");
    expect(afterGrace.connected).toBe(true);
  });

  it("Firebase 단절이 유예 시간 뒤까지 지속될 때만 오프라인을 표시한다", () => {
    const disconnected = reduceConnectivityBanner(INITIAL_CONNECTIVITY_BANNER_STATE, {
      type: "connection-changed",
      connected: false,
    });
    const afterGrace = reduceConnectivityBanner(disconnected, { type: "grace-elapsed" });

    expect(afterGrace.mode).toBe("offline");
    expect(afterGrace.hasShownOffline).toBe(true);
  });

  it("실제 오프라인 표시 후 재연결되면 복구 안내를 한 번 표시한다", () => {
    const afterGrace = reduceConnectivityBanner(
      reduceConnectivityBanner(INITIAL_CONNECTIVITY_BANNER_STATE, {
        type: "connection-changed",
        connected: false,
      }),
      { type: "grace-elapsed" },
    );
    const restored = reduceConnectivityBanner(afterGrace, {
      type: "connection-changed",
      connected: true,
    });
    const expired = reduceConnectivityBanner(restored, { type: "restored-notice-expired" });

    expect(restored.mode).toBe("restored");
    expect(expired.mode).toBe("hidden");
    expect(expired.hasShownOffline).toBe(false);
  });
});
