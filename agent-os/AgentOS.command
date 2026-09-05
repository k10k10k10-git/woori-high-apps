#!/bin/zsh
# 에이전트 OS 실행기 — 더블클릭하면 서버를 켜고 브라우저를 엽니다.
cd "$(dirname "$0")"
agent_os_started="no"

if /usr/sbin/lsof -nP -iTCP:5599 -sTCP:LISTEN >/dev/null 2>&1; then
  if ! /usr/bin/env node probe.js; then
    echo "포트 5599의 서비스가 현재 Agent OS 세션임을 확인하지 못했습니다."
    exit 1
  fi
  echo "이미 실행 중인 Agent OS를 확인했습니다 — 브라우저만 엽니다."
else
  /usr/bin/env node server.js >/dev/null 2>&1 &
  agent_os_server_pid=$!
  agent_os_started="yes"
fi

if [[ "$agent_os_started" == "yes" ]]; then
  agent_os_verified="no"
  for agent_os_attempt in {1..30}; do
    if /usr/bin/env node probe.js; then
      agent_os_verified="yes"
      break
    fi
    sleep 0.1
  done
  if [[ "$agent_os_verified" != "yes" ]]; then
    if kill -0 "$agent_os_server_pid" >/dev/null 2>&1; then
      kill "$agent_os_server_pid" >/dev/null 2>&1
      wait "$agent_os_server_pid" >/dev/null 2>&1
    fi
    echo "Agent OS 서버의 인증된 기동을 확인하지 못했습니다. 포트 5599 사용 상태를 확인하세요."
    exit 1
  fi
fi

if ! /usr/bin/osascript "$(pwd)/launch-browser.applescript"; then
  echo "인증된 Agent OS 브라우저 창을 열지 못했습니다."
  exit 1
fi
