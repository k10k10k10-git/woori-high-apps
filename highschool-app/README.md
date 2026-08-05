# 고등부 사역 플랫폼

학기 중 사역, 수련회 행정, 이가드 현장 운영을 한 웹페이지로 통합하는 Next.js 앱입니다.

## 로컬 실행

```bash
npm install
npm run dev
```

## 검증

```bash
npx tsc --noEmit
npm test
npm run build
```

## 주요 경로

- `/`: 통합 홈
- `/semesters`, `/semester/[id]`: 학기 사역
- `/retreats`, `/retreat/[id]`: 수련회 행정
- `/retreat/[id]/field`: 이가드 현장 운영

Firebase 데이터는 기존 앱의 경로와 스키마를 그대로 사용합니다. Rules는 이 앱에서 배포하지 않습니다. 상세 이관 계획은 `../docs/UNIFIED_HIGHSCHOOL_MIGRATION.md`를 참고하세요.
