// 운영 배포의 공개 버전만 조회한다. 로그인·DB 쓰기를 실행하지 않는다.
const expected = process.env.E2E_EXPECTED_BUILD_ID;
const base = process.env.E2E_BASE_URL;
if (!expected || !base) throw new Error("E2E_BASE_URL과 E2E_EXPECTED_BUILD_ID가 필요합니다.");
const deadline = Date.now() + 12 * 60_000;
let matched = false;
while (Date.now() < deadline) {
  try {
    const response = await fetch(new URL("/api/version", base), { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (response.ok && (await response.json()).buildId === expected) { matched = true; break; }
  } catch { /* 배포 중 일시 응답 실패는 제한 시간 안에서 재확인한다. */ }
  await new Promise(resolve => setTimeout(resolve, 10_000));
}
if (!matched) throw new Error(`운영 buildId가 대상 커밋 ${expected}와 일치하지 않습니다.`);
console.log(`운영 배포 버전 일치: ${expected}`);
