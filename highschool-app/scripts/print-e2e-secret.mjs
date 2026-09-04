// .auth/user.json을 GitHub 시크릿에 넣을 base64 한 줄로 출력한다.
//
// CI의 authenticated-e2e 잡은 E2E_STORAGE_STATE_B64 시크릿을 디코드해 쓴다.
// 시크릿이 비어 있으면 require-e2e-auth 가드에서 멈추므로, 저장소의 모든 PR·푸시가
// 빨간 상태가 된다. 이 스크립트는 그 값을 만드는 마지막 한 단계다.
//
//   npm run e2e:auth        # 창이 뜨면 구글 로그인 (사람이 해야 한다)
//   npm run e2e:secret      # 출력값을 GitHub 시크릿에 붙여넣기
//
// 저장 파일에는 로그인 자격이 들어 있다. 출력값을 채팅·이슈·커밋에 붙이지 말 것.
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const path = resolve(process.env.E2E_STORAGE_STATE || ".auth/user.json");

if (!existsSync(path) || statSync(path).size === 0) {
  console.error(`\n❌ ${path} 가 없거나 비어 있습니다.`);
  console.error(`   먼저 로그인 세션을 만드세요:  npm run e2e:auth\n`);
  process.exit(1);
}

console.log(`\n아래 한 줄 전체를 복사해 GitHub 저장소에 넣으세요.`);
console.log(`  Settings → Secrets and variables → Actions → New repository secret`);
console.log(`  Name:   E2E_STORAGE_STATE_B64`);
console.log(`  Secret: (아래 값)\n`);
console.log(readFileSync(path).toString("base64"));
console.log(`\n⚠ 이 값에는 로그인 자격이 들어 있습니다. 채팅·이슈·커밋에 남기지 마세요.\n`);
