import { describe, expect, it } from "vitest";
import { bridgeBanner, readBridgeHealth } from "./bridgeHealth";

const row = (over: Record<string, unknown> = {}) => ({ year: 2026, status: "blocked", alert: true, since: "2026-11-24T01:00:00Z", stuck_minutes: 190, checked_at: "2026-11-24T04:10:00Z", reasons: ["unmanaged_fields_lost"], notices: [], ...over });

describe("교적 다리 상태 배너", () => {
  it("DB 가 alert 로 판정한 해만 경고, 사유는 쉬운 말, 시간은 60분 미만 분·이상 시간", () => {
    expect(bridgeBanner(readBridgeHealth([row()])).alerts).toEqual(["우리틴즈 출석이 이 출석부로 3시간째 넘어오지 않고 있어요(반을 옮긴 학생 정보). 개발 담당자에게 알려 주세요."]);
    expect(bridgeBanner(readBridgeHealth([row({ stuck_minutes: 20, reasons: ["stale", "new_code"] })])).alerts[0]).toContain("20분째 넘어오지 않고 있어요(자동 반영이 멈춤)");
    for (const status of ["ok", "paused", "stopped", "legacy", "none"]) {
      expect(bridgeBanner(readBridgeHealth([row({ status, alert: false })])).alerts).toEqual([]);
    }
    const jan = bridgeBanner(readBridgeHealth([row({ year: 2026 }), row({ year: 2027, reasons: ["error"] })])).alerts;
    expect(jan.map((line) => line.slice(0, 6))).toEqual(["2026년 ", "2027년 "]);
  });

  it("안내는 경고와 따로, 같은 안내는 한 번, 모르는 코드와 notices 없는 옛 응답은 안내 없음", () => {
    expect(bridgeBanner(readBridgeHealth([row({ alert: false, status: "ok", notices: undefined })]))).toEqual({ alerts: [], notices: [] });
    const both = bridgeBanner(readBridgeHealth([row({ alert: false, status: "ok", notices: ["unmanaged", "legacy_writes"] }), row({ year: 2027, alert: false, status: "ok", notices: ["legacy_writes", "new_code"] })]));
    expect(both.alerts).toEqual([]);
    expect(both.notices).toHaveLength(2);
    expect(both.notices[0]).toContain("우리틴즈 출석부에서 입력해 주세요");
    expect(both.notices[1]).toContain("우리틴즈 명단에는 없는 학생");
  });

  it("모양이 이상한 응답은 배너 없음, 글에 함수 이름·영어 코드가 없다", () => {
    expect(readBridgeHealth(null)).toEqual([]);
    expect(readBridgeHealth([{ year: 2026, alert: "yes", status: "blocked" }])).toEqual([]);
    const all = bridgeBanner(readBridgeHealth([row({ reasons: ["large_delete", "identity_change"], notices: ["legacy_writes", "unmanaged"] })]));
    for (const line of [...all.alerts, ...all.notices]) expect(line).not.toMatch(/hs_bridge|rtdb|_|[a-z]{4,}/);
  });
});
