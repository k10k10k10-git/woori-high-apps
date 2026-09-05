"use strict";

const http = require("node:http");
const https = require("node:https");

// 선택 정보 조회 실패가 전체 보고서를 막지 않도록 시간·크기·연결 수명을 제한한다.
function readJson(url, { headers = {}, timeoutMs = 5_000, maxBytes = 256 * 1024 } = {}) {
  return new Promise((resolve) => {
    let request;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      request?.destroy();
      resolve(value);
    };
    // socket timeout은 데이터가 조금씩 도착하면 연장되므로 전체 요청 기한을 따로 둔다.
    const deadline = setTimeout(() => finish(null), timeoutMs);

    try {
      const parsed = new URL(url);
      const transport = parsed.protocol === "https:" ? https : parsed.protocol === "http:" ? http : null;
      if (!transport) return finish(null);
      request = transport.get(parsed, { headers }, (response) => {
        response.on("error", () => finish(null));
        response.on("aborted", () => finish(null));
        if (response.statusCode < 200 || response.statusCode >= 300) return finish(null);

        const chunks = [];
        let bytes = 0;
        response.on("data", (chunk) => {
          if (settled) return;
          bytes += chunk.length;
          if (bytes > maxBytes) return finish(null);
          chunks.push(chunk);
        });
        response.on("end", () => {
          if (settled) return;
          try { finish(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
          catch { finish(null); }
        });
      });
      request.on("error", () => finish(null));
    } catch { finish(null); }
  });
}

module.exports = { readJson };
