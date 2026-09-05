#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const http = require("node:http");
const {
  HOST,
  PORT,
  RUNTIME_DIR,
  createHealthProof,
  readSessionTokenFile,
} = require("./server");

function verifyAgentOsServer(options = {}) {
  const host = options.host || HOST;
  const port = options.port || PORT;
  const runtimeDir = options.runtimeDir || RUNTIME_DIR;
  const timeoutMs = options.timeoutMs || 750;

  let sessionToken;
  try { sessionToken = readSessionTokenFile(runtimeDir); }
  catch { return Promise.resolve(false); }

  const challenge = crypto.randomBytes(32).toString("hex");
  const expected = Buffer.from(createHealthProof(sessionToken, challenge));

  return new Promise((resolve) => {
    let settled = false;
    const finish = (verified) => {
      if (settled) return;
      settled = true;
      resolve(verified);
    };
    const request = http.get({
      host,
      port,
      path: `/.well-known/agent-os-health?challenge=${challenge}`,
      headers: { Accept: "text/plain" },
    }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        return finish(false);
      }
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
        if (Buffer.byteLength(body) > 128) request.destroy();
      });
      response.on("end", () => {
        const supplied = Buffer.from(body.trim());
        finish(supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected));
      });
      response.on("error", () => finish(false));
    });
    request.setTimeout(timeoutMs, () => request.destroy());
    request.on("error", () => finish(false));
    request.on("close", () => finish(false));
  });
}

if (require.main === module) {
  verifyAgentOsServer()
    .then((verified) => { process.exitCode = verified ? 0 : 1; })
    .catch(() => { process.exitCode = 1; });
}

module.exports = { verifyAgentOsServer };
