# 에이전트 OS — 통합 플랫폼 로컬 운영 도구

**실행**: `AgentOS.command`를 더블클릭합니다. 런처는 challenge-HMAC으로 포트 5599의 프로세스가 현재 토큰을 가진 Agent OS인지 확인한 뒤 브라우저를 엽니다. `node agent-os/server.js`로 먼저 서버만 기동한 경우에도 이어서 `AgentOS.command`를 실행해야 인증된 주소가 열립니다. 검증되지 않은 프로세스가 포트를 사용 중이면 토큰이나 브라우저를 넘기지 않고 중단합니다.

- **홈**: 일일 보고서 — 어제/오늘 커밋, Vercel 배포 상태, 이번 주 세션, 백로그, 밤새 실행 항목
- **스킬**: 영역별 원클릭 버튼 → Claude Code가 헤드리스로 실행되고 출력이 실시간 스트리밍
- **로그**: 모든 실행 이력, 클릭해서 전체 기록 확장

**새 버튼 추가 (5분)**: `skills.json`의 `skills` 배열에 항목 추가 → 브라우저 새로고침
```json
{ "id": "my-skill", "domain": "영역이름", "label": "버튼 이름",
  "desc": "설명 한 줄", "prompt": "/스킬명 인자 또는 자연어 지시", "danger": false }
```
`danger: false` 스킬은 Claude의 safe mode·plan 권한과 `Read,Glob,Grep` 도구만 사용합니다. 저장소 코드 실행, 파일 수정, 네트워크 도구는 사용할 수 없습니다. 테스트·브라우저 QA·배포 확인처럼 외부 명령이나 프로젝트 코드를 실행해야 하는 스킬도 `danger: true`로 분류합니다.

`danger: true`면 서버가 macOS 네이티브 확인창을 직접 띄웁니다. 사용자가 승인해야 서버가 30초 동안 한 번만 유효하며 스킬 ID·프롬프트에 묶인 무작위 승인값을 발급합니다. 실행 API는 이 승인값을 소비한 요청에만 높은 권한을 허용하고 재사용을 거부합니다.

서버는 `127.0.0.1`에만 바인딩됩니다. 프로세스별 토큰은 `/tmp/agent-os-<uid>/session-token`에 디렉터리 `0700`·파일 `0600`으로 원자 기록됩니다. `probe.js`는 이 파일을 직접 읽고 무작위 challenge의 HMAC을 비교하므로 토큰을 임의 listener에 보내지 않습니다. 검증 뒤 `launch-browser.applescript`가 파일을 직접 읽어 URL fragment로 전달하며, 브라우저 스크립트는 즉시 주소에서 지우고 메모리에만 보관합니다. 토큰은 프로세스 명령행·HTML·로그에 넣지 않습니다.

기본 HTML과 `/app.js`에는 토큰이 없으며 모든 `/api/*`는 토큰을 요구합니다. 인증 전 health 경로는 무작위 challenge의 HMAC만 반환하고 운영 데이터나 토큰은 반환하지 않습니다. 실행 API는 Host·Origin·Fetch Metadata도 함께 검사합니다. 서버를 종료하거나 재시작하면 자신이 기록한 토큰 파일도 정리됩니다.

실행 로그는 `runs/`에 저장됩니다(git 제외). 의존성 0개 — Node 내장 모듈만 사용.

보안 경계 검증은 `node --test agent-os/security.test.js`로 실행합니다. 정상 요청도 주입된 스텁까지만 전달하며 실제 스킬은 실행하지 않습니다.
