# 에이전트 OS — Claude Code 위의 로컬 웹앱

**실행**: `AgentOS.command` 더블클릭 (또는 `node agent-os/server.js`) → http://localhost:5599

- **홈**: 일일 보고서 — 어제/오늘 커밋, Vercel 배포 상태, 이번 주 세션, 백로그, 밤새 실행 항목
- **스킬**: 영역별 원클릭 버튼 → Claude Code가 헤드리스로 실행되고 출력이 실시간 스트리밍
- **로그**: 모든 실행 이력, 클릭해서 전체 기록 확장

**새 버튼 추가 (5분)**: `skills.json`의 `skills` 배열에 항목 추가 → 브라우저 새로고침
```json
{ "id": "my-skill", "domain": "영역이름", "label": "버튼 이름",
  "desc": "설명 한 줄", "prompt": "/스킬명 인자 또는 자연어 지시", "danger": false }
```
`danger: true`면 실행 전 확인창이 뜹니다(배포·커밋 등).

실행 로그는 `runs/`에 저장됩니다(git 제외). 의존성 0개 — Node 내장 모듈만 사용.
