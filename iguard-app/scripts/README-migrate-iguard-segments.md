# 이가드 동선 구간 마이그레이션

`migrate-iguard-segments.js`는 기존 `staffId__blockId` 동선을 구간 기반
`segmentId__postId__staffId` 동선으로 옮긴다. Firebase 프로젝트는
`woori-high`로 고정되어 있다.

## 1. 읽기 전용 dry-run

```bash
npm run migrate:segments -- --all
```

특정 수련회만 확인할 때:

```bash
npm run migrate:segments -- --retreat-id <retreat-id>
```

기본 모드는 운영 DB를 읽기만 한다. 결과는 Git에서 제외된
`backups/movement-segments-dry-run-<시각>/`에 저장된다.

- `report.json`: 수련회별 기존·변환·미해결 동선 건수와 차단 이슈
- `payload.patch.json`: 승인 후 적용할 경로별 변경안
- `restore.patch.json`: 변경안을 되돌릴 경로별 복구안

`totalIssueCount`가 1 이상이거나 수련회별 `fullyConverted`가 `false`이면
운영 실행을 해서는 안 된다.

## 2. 운영 실행 승인 게이트

운영 실행 전에 반드시 다음 순서를 지킨다.

1. dry-run 보고서의 대상·변환·잔여·이슈 건수를 사용자에게 공유한다.
2. 운영 DB 쓰기 경로와 건수, 스냅샷·복구 계획을 밝히고 명시적 승인을 받는다.
3. 승인 후에만 아래 명령을 실행한다.

```bash
npm run migrate:segments -- \
  --retreat-id <retreat-id> \
  --execute \
  --confirm EXECUTE_SEGMENT_MIGRATION
```

실행 모드는 먼저 수련회별 `schedule.before.json`, `segments.before.json`,
`movements.before.json` 스냅샷을 남긴 뒤, 이슈가 0건일 때만 루트
multi-path update 한 번으로 적용한다. Firebase Rules는 배포하지 않는다.

## 3. 복구

실행 폴더의 `RESTORE.txt`에 해당 실행의 절대 경로를 포함한 복구 명령이
기록된다. 적용 후 건수나 화면 검증에서 불일치가 하나라도 발견되면 추가
수정을 하지 말고 그 명령으로 해당 실행의 경로만 복구한다.
