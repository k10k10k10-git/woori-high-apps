# normalize-retreat-db 실행 가이드

이 스크립트는 수련회 DB 정규화 후보를 검토하기 위한 도구다. 기본값은 `--dry-run`이며, `--execute`를 붙이지 않으면 Firebase DB에 쓰지 않는다.

## 대상

- `N-01`: 공개 `retreats/{id}/teachers/*/idNumber` 빈 필드 제거
- `N-02`: 겨울수련회 legacy 교사 `originKey` backfill
- `N-03`: `retreats/{id}/milestones` 중복 legacy milestone 정리

## Dry-run

```bash
node scripts/normalize-retreat-db.js --retreat-id -OnzAiqQpn7McL0MWe7M --fix all
```

결과는 `backups/normalize-retreat-db-<timestamp>/` 아래에 저장된다.

- `before-summary.json`: 읽은 데이터의 건수 요약
- `payload.json`: 실제 실행 시 적용될 멀티패스 payload
- `report.json`: 후보/skip/예시 요약

## 실제 실행

실제 실행은 사용자가 dry-run 결과를 확인한 뒤, 별도로 `실행 승인`이라고 답했을 때만 진행한다.

```bash
node scripts/normalize-retreat-db.js --retreat-id -OnzAiqQpn7McL0MWe7M --fix public-teacher-idnumber --execute
```

`--execute` 모드에서는 DB 쓰기 직전에 전체 루트 백업을 `root-before-execute.json`으로 저장한 뒤, `payload.json`을 루트 멀티패스 update로 적용한다.

## 롤백

- `N-01`: 백업에서 삭제된 `idNumber` path를 복구한다.
- `N-02`: 이번 실행에서 추가된 `originKey` path만 `null`로 되돌린다.
- `N-03`: 백업에서 `retreats/{id}/milestones`를 복구한다.

출석부 원본 노드인 `classes/*`, `attendance/*`에는 쓰지 않는다.
