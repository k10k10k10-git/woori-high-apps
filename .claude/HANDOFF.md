# 인수인계 — 2026-07-30 (에이전트 중립 — GPT/Codex/Claude 공용)

## 지금 하던 일

`iguard-app/REMODEL_PLAN.md`의 PA-1부터 P6까지 코드 구현과 승인된 운영
동선 마이그레이션을 완료했다. 현재는 최종 배포 직전이며, **main push는
아직 하지 않았다.**

## 반드시 먼저 읽을 것

1. 루트 `AGENTS.md`
2. 루트 `CLAUDE.md`
3. 이 파일
4. `iguard-app/CLAUDE.md`
5. `iguard-app/REMODEL_PLAN.md`
6. `iguard-app/REMODEL_RELEASE_CHECKLIST.md`

모든 작업 첫 응답에서 DB 안전 4문답을 먼저 답한다. Firebase Rules는
`고등부 학생 출석부/database.rules.json` 외의 파일에서 배포하지 않는다.

## 완료된 로컬 커밋

아래 11개 구현·출시 준비 커밋과 최종 요구사항 감사 커밋 1개는
`main`에 있으나 `origin/main`보다 앞서 있으며 아직 push하지 않았다.

| 해시 | 단계 | 내용 |
|---|---|---|
| `f8bb0e1` | PA-1 | 조별 정보 방 카드에 학생 이름 |
| `1a03b55` | PA-2 | 개인 큐카드 한눈에 보기 |
| `d0ab7c8` | PA-3 | 375px 현장 화면 가독성 |
| `3d91df0` | P1 | 구간 기반 동선 모델과 기본 구간 어댑터 |
| `9fdf031` | P2 | 안전한 동선 마이그레이션 도구 |
| `35cbd2f` | P3 | 실제 큐싯 구간 동기화와 전체 개요 |
| `866d272` | P4 | GBS 장소 단일 원천과 역방향 조회 |
| `96c295f` | P0b | 명찰카드 자동 생성·인쇄 |
| `1a801f9` | P5 | 큐싯 직접 편집과 구조만 복제 |
| `f463200` | P6 | 현장 진행 마커와 지연 시각 파생 |
| `a6be8c0` | 출시 준비 | 배포 전 검증·리허설·롤백 체크리스트 |

구현 핵심:

- 시간 블록 → 구간 → 포스트·담당자 구조를 사이트에서 직접 편집한다.
- 단일 레코드는 `update()`, 동선 자연키 변경은 루트 multi-path update로
  이전 키 삭제와 새 키 생성을 한 번에 처리한다.
- 구조 복제는 사람·메모·조·버스·GBS·인원체크·PIN을 복제하지 않는다.
- 구글 시트는 지속 동기화가 아니라 초기 1회 이관 도구다.
- 진행 버튼은 계획 시간을 고치지 않고 `actualStart/actualStartAt` 한
  블록만 기록해 이후 표시 시각을 파생한다.

## 운영 DB 이관 — 승인·실행 완료

사용자가 “운영 DB 이관 승인”을 명시했고, 수련회별 스냅샷 뒤 한 번씩
실행했다. Firebase Rules 배포는 없었다.

| 수련회 | 기존/변환/최종 동선 | 기본 구간 | 이슈 | 백업 |
|---|---:|---:|---:|---|
| `-OnzAiqQpn7McL0MWe7M` | 149 / 149 / 149 | 26 | 0 | `iguard-app/backups/movement-segments-execute-2026-07-30T09-16-51-053Z/` |
| `-Ov_SQVKmfIcnPSlPGDC` | 200 / 200 / 200 | 22 | 0 | `iguard-app/backups/movement-segments-execute-2026-07-30T09-17-19-542Z/` |

합계: 동선 349건, 기본 구간 48건, 적용 경로 746개, 이슈 0건.
최종 dry-run은 레거시 0건·구조화 349건·이슈 0건이었다.

실행 전 스냅샷과 현재 운영 동선을
`staffId + blockId + postId + round + note + source` 의미 필드
다중집합으로 전수 대조한 결과도 두 수련회 모두 양방향 차이 0건이었다.
수련회별 배정 수 상위 스탭 3명의 전후 건수도 모두 동일했다.

불일치가 발견되면 새 패치를 쓰지 말고 각 실행 폴더의 `RESTORE.txt`를
사용한다. `backups/`는 Git 제외이며 임의 삭제하지 않는다.

## 검증 상태

최종 요구사항 감사까지 포함한 자동 검증:

- `npm test`: 38개 파일, 276개 통과
- `npm run typecheck`: 오류 0
- `npm run lint`: 오류 0, 기존 기준선 경고 10
- `npm run build`: 성공

최종 문서 작성 뒤에도 네 명령을 다시 실행했고 같은 결과로 통과했다.
2026-07-30 19:41 KST 읽기 전용 DB dry-run도 구조화 동선 349건,
레거시 0건, 추가 payload 0건, 이슈 0건으로 통과했다.

375×812 브라우저 QA:

- 로컬 production 서버와 로그인 화면은 정상 렌더링됐다.
- 인앱 브라우저와 Chrome 모두 Firebase 로그인 세션이 없어 보호된
  화면의 실제 375px 읽기 검증은 수행하지 못했다.
- 로그인·저장은 시도하지 않았다. 운영 DB 추가 쓰기 0건.
- 보호 화면 검증은 `iguard-app/REMODEL_RELEASE_CHECKLIST.md` 4장에
  수동 게이트로 남겼다.

## 아직 완료로 표시하면 안 되는 것

1. **초보 큐싯 제작자 관찰 테스트**
   - 설명 없이 30분
   - 블록 3개 이상을 구간·포스트까지 채우면 통과
   - 통과 전 P5는 코드 구현 완료이지 운영 전환 완료가 아니다.
2. **로그인 후 모바일·동시편집·현장진행·인쇄·오프라인 리허설**
   - 전체 절차는 `iguard-app/REMODEL_RELEASE_CHECKLIST.md` 4장.
3. **스프레드시트 폐기**
   - 위 두 게이트 통과 전에는 폐기하지 않는다.
4. **S4 설문 결과**
   - 다음 수련회 사후 설문에서만 측정할 수 있다.

## 다음 실행자가 할 일

1. `git status --short`와 `git log origin/main..HEAD`를 확인한다.
2. 사용자에게 자동 검증 결과, 운영 DB 이관 결과, 남은 수동 게이트를
   보고하고 **main push/운영 배포의 별도 최종 승인**을 요청한다.
3. 승인 전에는 push하거나 `vercel --prod`를 실행하지 않는다.
4. 승인 후 push하고 두 앱 `/api/version`과 Vercel Ready를 확인한다.

## 배포·롤백

`main` push는 `iguard-app`과 `retreat-app`의 Vercel 자동 배포를
트리거한다. 배포 전 승인 필요.

```bash
cd /Users/sunghoon/Desktop/ai개발
git push origin main
git rev-parse HEAD
curl -s https://iguard-app.vercel.app/api/version
curl -s https://retreat-app-theta.vercel.app/api/version
cd iguard-app && npx vercel ls
```

치명 결함이면 Vercel 직전 Ready 배포 또는 문제 커밋 revert로 앱을
되돌린다. DB 이관 롤백은 위 실행 폴더의 경로별 restore patch만 사용하며
전체 `retreats` 노드를 덮어쓰지 않는다.

## 작업 트리 주의

과거부터 존재하는 미추적 디렉터리는 이 작업 대상이 아니다.

- `.agents/`
- `outputs/`
- `rayquaza-v2-upgrade/`
- `tmp/`

임의 커밋·삭제하지 않는다. `git add .`도 사용하지 않는다.
