const fs = require("fs");

const d = new Date(Date.now() + 9 * 3600 * 1000);
const tag = [
  d.getUTCFullYear(),
  String(d.getUTCMonth() + 1).padStart(2, "0"),
  String(d.getUTCDate()).padStart(2, "0"),
].join("");

const file = "public/sw.js";
const nextCacheName = `woori-att-${tag}`;
const current = fs.readFileSync(file, "utf8");
const updated = current.replace(/woori-att-\d{8}/g, nextCacheName);

fs.writeFileSync(file, updated);
console.log(`CACHE_NAME -> ${nextCacheName}`);
