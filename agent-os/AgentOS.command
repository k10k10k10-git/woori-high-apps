#!/bin/zsh
# 에이전트 OS 실행기 — 더블클릭하면 서버를 켜고 브라우저를 엽니다.
cd "$(dirname "$0")"
if lsof -i :5599 >/dev/null 2>&1; then
  echo "이미 실행 중 — 브라우저만 엽니다."
else
  /usr/bin/env node server.js > /tmp/agent-os.log 2>&1 &
  sleep 1
fi
open "http://localhost:5599"
