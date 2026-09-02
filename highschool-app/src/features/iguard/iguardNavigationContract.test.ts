import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/** 디렉터리 아래 모든 ts/tsx를 재귀 수집(테스트 파일 제외). */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(process.cwd(), dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(process.cwd(), rel)).isDirectory()) { out.push(...sourceFiles(rel)); continue; }
    if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts") && !entry.endsWith(".test.tsx")) out.push(rel);
  }
  return out;
}

/** 현장(이가드) 화면을 이루는 모든 소스. */
const FIELD_SOURCES = [
  ...sourceFiles("src/features/iguard"),
  ...sourceFiles("src/app/field"),
  ...sourceFiles("src/app/retreat/[id]/field"),
];

describe("이가드 무재로딩 전환 계약", () => {
  // 2026-08-05 통합 전까지 이가드는 별개 앱이라 자기 인증 조회를 갖고 있었고,
  // 통합 때 그 import 경계를 유지하는 어댑터(features/iguard/context/AuthContext)로
  // 봉합했다. 어댑터는 2026-09-02에 제거했으므로, 여기서는 파일 하나가 아니라
  // **현장 소스 전체**에 대해 같은 불변식을 지킨다.
  it("현장 화면은 루트 인증 상태만 쓰고 자기 Firebase 인증 조회를 열지 않는다", () => {
    expect(FIELD_SOURCES.length).toBeGreaterThan(10);
    for (const file of FIELD_SOURCES) {
      const code = source(file);
      expect(code, `${file} 가 자체 인증 구독을 연다`).not.toContain("onAuthStateChanged");
      expect(code, `${file} 가 자체 로그인을 호출한다`).not.toContain("signInWithPopup");
      // useAuth를 쓴다면 반드시 루트 컨텍스트에서 가져온다.
      if (/\buseAuth\b/.test(code)) {
        expect(code, `${file} 의 useAuth 출처가 루트 컨텍스트가 아니다`)
          .toContain('from "@/context/AuthContext"');
      }
    }
  });

  it("현장 진입 페이지는 별도 인증 프로바이더로 감싸지 않는다", () => {
    for (const page of ["src/app/field/page.tsx", "src/app/retreat/[id]/field/page.tsx"]) {
      const code = source(page);
      // 주석에 이름이 나오는 것은 허용하고, 실제 import/JSX 사용만 막는다.
      expect(code, `${page} 가 AuthProvider를 import 한다`).not.toMatch(/^import .*AuthProvider/m);
      expect(code, `${page} 가 AuthProvider로 감싼다`).not.toMatch(/<\w*AuthProvider[\s>]/);
      expect(code, `${page} 의 iguard-scope 격리가 사라졌다`).toContain('className="iguard-scope"');
    }
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
