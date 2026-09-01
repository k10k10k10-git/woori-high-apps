import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("이가드 무재로딩 전환 계약", () => {
  it("전역 인증 상태를 재사용하고 별도 Firebase 인증 조회를 시작하지 않는다", () => {
    const context = source("src/features/iguard/context/AuthContext.tsx");
    expect(context).toContain('useAuth as usePortalAuth');
    expect(context).toContain("const auth = usePortalAuth()");
    expect(context).not.toContain("onAuthStateChanged");
    expect(context).not.toContain("get(ref(db");
  });

  it("현장 하위 탭은 서버 라우트를 다시 탐색하지 않는다", () => {
    const client = source("src/app/retreat/[id]/field/IguardClient.tsx");
    const selectView = client.slice(
      client.indexOf("const selectView"),
      client.indexOf("// 데이터 허브"),
    );
    expect(selectView).toContain("window.history.replaceState");
    expect(selectView).not.toContain("router.replace");
  });
});
