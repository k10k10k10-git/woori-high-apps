// ════════════════════════════════════════════════════════════
// 민감 노드(retreats/{id}/{cancellations,unmatchedPayments,medicalLogs})를
// retreatsPrivate/{id}/... 로 옮기기 위한 "추가식(additive)" 마이그레이션 빌더.
//
// 원본은 절대 지우지 않는다. retreatsPrivate 로 복사할 JSON만 만든다.
// 검증 후 원본 삭제는 사람이 수동으로 한다.
//
// 사용법 (firebase CLI 로그인 상태에서 — 별도 서비스계정 불필요):
//   1) firebase database:get /retreats -o /tmp/retreats.json --project woori-high
//   2) node scripts/build-private-migration.mjs /tmp/retreats.json /tmp/private.json
//   3) (검토) cat /tmp/private.json | head
//   4) firebase database:update /retreatsPrivate /tmp/private.json --project woori-high
//   5) 행정 앱에서 취소명단/입금미매칭/의료일지가 정상 표시되는지 확인
//   6) 정상 확인 후에만 원본 삭제(선택):
//        각 수련회마다 firebase database:remove /retreats/{id}/cancellations 등
// ════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from "node:fs";

const SENSITIVE_KEYS = ["cancellations", "unmatchedPayments", "medicalLogs"];

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error("usage: node build-private-migration.mjs <retreats.json> <out.json>");
  process.exit(1);
}

const retreats = JSON.parse(readFileSync(inPath, "utf8")) || {};
const out = {};
let moved = 0;

for (const [retreatId, retreat] of Object.entries(retreats)) {
  if (!retreat || typeof retreat !== "object") continue;
  const bucket = {};
  for (const key of SENSITIVE_KEYS) {
    if (retreat[key] != null) {
      bucket[key] = retreat[key];
      const n = typeof retreat[key] === "object" ? Object.keys(retreat[key]).length : 1;
      moved += n;
      console.log(`  ${retreatId}/${key}: ${n}건`);
    }
  }
  if (Object.keys(bucket).length > 0) out[retreatId] = bucket;
}

writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`\n총 ${moved}건을 ${Object.keys(out).length}개 수련회에서 추출 → ${outPath}`);
console.log("다음: firebase database:update /retreatsPrivate", outPath, "--project woori-high");
