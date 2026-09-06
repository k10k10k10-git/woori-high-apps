import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ apps: [] as unknown[], initialize: vi.fn(), cert: vi.fn(), auth: vi.fn(), database: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("firebase-admin/app", () => ({ getApps: () => mocks.apps, initializeApp: mocks.initialize, cert: mocks.cert }));
vi.mock("firebase-admin/auth", () => ({ getAuth: mocks.auth }));
vi.mock("firebase-admin/database", () => ({ getDatabase: mocks.database }));
import { getPraiseFirebaseAdmin } from "./firebaseAdmin";

function configured() {
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "test-project");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_DATABASE_URL", "https://test-project-default-rtdb.asia-southeast1.firebasedatabase.app");
  vi.stubEnv("FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON", JSON.stringify({ type: "service_account", project_id: "test-project", client_email: "server@test-project.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----test-only" }));
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.apps = [];
  vi.stubEnv("FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON", "");
  vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", ""); vi.stubEnv("FIREBASE_DATABASE_EMULATOR_HOST", "");
  mocks.initialize.mockImplementation((options, name) => { const app = { options, name }; mocks.apps.push(app); return app; });
  mocks.cert.mockReturnValue({ credential: true });
});
afterEach(() => vi.unstubAllEnvs());

describe("찬양팀 서버 자격 경계", () => {
  it("미설정 상태에서 자동 ADC를 탐색하지 않고 503으로 중단한다", () => {
    expect(() => getPraiseFirebaseAdmin()).toThrow(expect.objectContaining({ status: 503, code: "server_not_configured" }));
    expect(mocks.initialize).not.toHaveBeenCalled();
  });
  it("지정 프로젝트 전용 앱을 만들고 같은 서버 앱을 재사용한다", () => {
    configured(); const first = getPraiseFirebaseAdmin(); const second = getPraiseFirebaseAdmin();
    expect(first.app).toBe(second.app); expect(mocks.initialize).toHaveBeenCalledTimes(1);
    expect(mocks.initialize).toHaveBeenCalledWith(expect.objectContaining({ projectId: "test-project" }), "woori-praise-server");
  });
  it.each(["https://unrelated-default-rtdb.asia-southeast1.firebasedatabase.app", "https://test-project-default-rtdb.evil.example", "http://test-project.firebaseio.com", "https://test-project.firebaseio.com/private", "https://test-project.firebaseio.com?auth=test", "https://test-project.firebaseio.com:8443"])("허용하지 않은 DB 주소를 거절한다: %s", (url) => {
    configured(); vi.stubEnv("NEXT_PUBLIC_FIREBASE_DATABASE_URL", url);
    expect(() => getPraiseFirebaseAdmin()).toThrow(expect.objectContaining({ status: 503 }));
    expect(mocks.initialize).not.toHaveBeenCalled();
  });
  it.each(["{}", "null", "malformed", JSON.stringify({ type: "service_account", project_id: "different-project" })])("인증서가 잘못되어도 원문을 노출하지 않는다", (credential) => {
    configured(); vi.stubEnv("FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON", credential);
    expect(() => getPraiseFirebaseAdmin()).toThrow("찬양팀 서버 연결을 확인하고 다시 시도해 주세요.");
  });
  it("에뮬레이터 환경변수가 있는 운영 연결을 거절한다", () => {
    configured(); vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099");
    expect(() => getPraiseFirebaseAdmin()).toThrow(expect.objectContaining({ status: 503 }));
  });
  it("이미 생성된 앱이 다른 DB를 향하면 재사용하지 않는다", () => {
    configured(); mocks.apps = [{ name: "woori-praise-server", options: { projectId: "test-project", databaseURL: "https://different.firebaseio.com" } }];
    expect(() => getPraiseFirebaseAdmin()).toThrow(expect.objectContaining({ status: 503 }));
  });
});
