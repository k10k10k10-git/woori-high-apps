const fs = require("fs");

function updateCacheVersion(file, version = String(Date.now())) {
  if (!/^[a-zA-Z0-9_-]+$/.test(version)) {
    throw new Error(`잘못된 캐시 버전입니다: ${version}`);
  }

  const nextCacheName = `woori-att-${version}`;
  const current = fs.readFileSync(file, "utf8");
  const updated = current.replace(/woori-att-[a-zA-Z0-9_-]+/g, nextCacheName);
  if (updated === current) {
    throw new Error(`${file}에서 기존 캐시 버전을 찾지 못했습니다.`);
  }

  fs.writeFileSync(file, updated);
  return nextCacheName;
}

if (require.main === module) {
  const file = process.argv[2] || "out/sw.js";
  const nextCacheName = updateCacheVersion(file);
  console.log(`CACHE_NAME -> ${nextCacheName}`);
}

module.exports = { updateCacheVersion };
