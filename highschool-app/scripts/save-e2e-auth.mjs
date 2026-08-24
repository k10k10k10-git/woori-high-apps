// E2E용 로그인 상태를 한 번만 저장한다.
//
// 통합 앱은 구글 OAuth라 헤드리스로 통과할 수 없다. 그래서 이 스크립트가 창을 띄우고
// 사람이 직접 로그인하면, 그 세션을 storage state로 저장해 이후 E2E가 재사용한다.
//
// 저장 파일에는 로그인 자격이 들어 있다. `.auth/`는 .gitignore에 있으며 커밋 금지다.
//
//   node scripts/save-e2e-auth.mjs
//
// 구글은 자동화 브라우저의 OAuth를 막는 경우가 있어, 설치된 실제 Chrome 채널과
// 영구 프로필을 쓴다. 그래도 막히면 아래 안내대로 프로필을 재사용한다.

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.E2E_BASE_URL || "https://woorihigh-app.vercel.app";
const OUT = resolve(process.env.E2E_STORAGE_STATE || ".auth/user.json");
const PROFILE = resolve(".auth/chrome-profile");
const WAIT_MS = 5 * 60 * 1000;

mkdirSync(dirname(OUT), { recursive: true });
mkdirSync(PROFILE, { recursive: true });

console.log(`\n창이 열리면 평소처럼 구글 로그인만 해주세요.`);
console.log(`로그인이 감지되면 자동으로 저장하고 창을 닫습니다. (최대 5분 대기)\n`);

const context = await chromium.launchPersistentContext(PROFILE, {
  channel: "chrome",
  headless: false,
  viewport: { width: 1280, height: 900 },
});

const page = context.pages()[0] ?? (await context.newPage());
await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

try {
  // 로그인 완료 신호: 로그아웃 버튼이 생기면 포털에 들어온 것이다.
  await page.getByText("로그아웃", { exact: false }).first().waitFor({ timeout: WAIT_MS });
  // Firebase Auth는 로그인 세션을 IndexedDB에 저장한다. 쿠키·localStorage만
  // 저장하면 다음 E2E 컨텍스트에서 다시 비로그인 상태가 되므로 함께 보존한다.
  await context.storageState({ path: OUT, indexedDB: true });
  console.log(`\n✅ 저장 완료: ${OUT}`);
  console.log(`   이제 이렇게 돌립니다:\n   E2E_STORAGE_STATE=${OUT} npm run test:e2e:smoke\n`);
} catch {
  console.error(`\n❌ 5분 안에 로그인이 감지되지 않았습니다.`);
  console.error(`   창에서 로그인을 마치지 못했다면 다시 실행해주세요.`);
  console.error(`   구글이 "보안되지 않은 브라우저"로 막는다면 알려주세요 — 다른 방법을 씁니다.\n`);
  process.exitCode = 1;
} finally {
  await context.close();
}
