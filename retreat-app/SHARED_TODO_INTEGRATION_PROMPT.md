# 이동가이드 사이트에 공유 준비일정 To do 붙이기 프롬프트

아래 내용을 새로 연 "수련회 준비 이동가이드 사이트" 프로젝트에서 Codex에게 그대로 전달하세요.

```text
현재 프로젝트에 행정 사이트와 같은 Firebase Realtime Database 기반 공유 준비일정 To do 기능을 붙여줘.

중요한 기존 행정 사이트 정보:
- 행정 사이트는 Firestore가 아니라 Firebase Realtime Database를 사용한다.
- Firebase 초기화는 같은 프로젝트 설정을 사용해야 한다.
- 공유 To do 데이터 경로는 `retreats/{retreatId}/milestones` 이다.
- 수련회 기간/캘린더 배경 데이터 경로는 `retreats/{retreatId}/periods` 이다.
- `milestones`는 양쪽 사이트에서 추가/수정/완료 체크/삭제가 가능해야 한다.
- `periods`는 이동가이드 사이트에서 우선 읽기만 해도 된다. 꼭 필요할 때만 편집 UI를 붙여라.

milestone 데이터 형태:
{
  title: string,
  targetDate: "YYYY-MM-DD",
  done: boolean,
  note?: string | null,
  createdAt?: number,
  updatedAt?: number,
  sourceSite?: string
}

행정 사이트에서 쓰는 sourceSite 값은 `retreat-admin`이고,
이동가이드 사이트에서 새로 만드는 항목에는 `move-guide`를 넣어줘.

구현 요구사항:
1. 현재 프로젝트의 Firebase 설정 방식을 먼저 확인한다.
2. 같은 Firebase Realtime Database 프로젝트를 보도록 설정한다.
3. `retreatId`를 현재 이동가이드 사이트에서 선택/사용 중인 수련회 id와 연결한다.
4. `onValue(ref(db, "retreats/{retreatId}/milestones"))`로 실시간 구독한다.
5. 추가는 `push`, 수정/완료 체크는 `update`, 삭제는 `remove`를 사용한다.
6. 추가 시 `createdAt`, `updatedAt`, `sourceSite: "move-guide"`를 함께 저장한다.
7. 수정 시 `updatedAt`을 갱신한다.
8. 메모를 비울 때는 `undefined`가 아니라 `null` 또는 필드 삭제 방식으로 처리한다.
9. 기존 UI 스타일을 유지하면서, 캘린더 날짜별 To do 표시와 날짜 클릭 후 To do 추가/수정/삭제 패널을 구현한다.
10. 행정 사이트와 같은 데이터가 양쪽에서 바로 반영되는지 빌드 또는 로컬 실행으로 확인한다.

참고할 행정 사이트 파일명:
- `src/app/RetreatCalendarPanel.tsx`
- `src/lib/db.ts`
- `src/lib/types.ts`

권한 관련 참고:
- 행정 사이트의 `database.rules.json`에는 `retreats/{retreatId}/milestones`에 대해
  `admins`, `retreatAdmins`, `iguardMembers`가 쓸 수 있도록 rules를 추가해두었다.
- 이동가이드 사이트 로그인 사용자가 `iguardMembers`로 관리된다면 같은 rules 배포 후 To do 쓰기가 가능해야 한다.
```
