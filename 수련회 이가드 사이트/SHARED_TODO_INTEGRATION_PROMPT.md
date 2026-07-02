# 행정 ↔ 이가드 공유 통합 계약 (SHARED_TODO)

행정(retreat-app)과 이가드(iguard-app)는 같은 Firebase(`woori-high`)를 공유합니다.
이 문서는 **두 사이트가 함께 지켜야 하는 데이터 계약**을 한 곳에 고정합니다.
스키마/공식이 한 글자라도 달라지면 양쪽이 조용히 어긋나므로, 변경 시 **이 문서를 먼저 수정**하세요.

> 경계 원칙: 학생 명단·출결 데이터는 **행정이 소유**, 이가드는 **읽기 전용**으로 소비합니다.

---

## 1. 부분참 (본대 / 선복귀 / 후발대)

수련회 첫날·마지막날에 함께 이동하는 인원이 다릅니다.

- **1일차 출발** = 본대 + 선복귀 (후발대 제외)
- **3일차 교회 복귀** = 본대 + 후발대 − 선복귀

> 선발대는 **학생에는 없음** → 넣지 않습니다. (선발대는 스탭 전용 개념: `IguardStaff.corps`)

### 1-1. 데이터 노드 (행정 소유)

```
retreats/{retreatId}/partialAttendances/{uniqueKey} = {
  type: "선복귀" | "후발대",   // 엔트리 없음 = 본대(기본)
  note?: string,
  updatedAt?: number
}
```

- `uniqueKey = `${buNum}_${studentId}``  — 학생 단일 식별키. `classes/{year}` 정규화 키와 동일(이가드 `Student.id`).
- 대다수 학생은 **본대**이므로 엔트리를 만들지 않습니다(예외만 저장).

### 1-2. 일자별 참석 공식 (양쪽 동일)

```
isPresentOnDay(type, day):
  if type 없음(본대): true            // 1·3일차 모두 참석
  day === 1: return type !== "후발대"  // 본대, 선복귀 참석
  day === 3: return type !== "선복귀"  // 본대, 후발대 참석
```

| 분류 | 1일차 | 3일차 |
|---|---|---|
| 본대(기본) | ✅ | ✅ |
| 선복귀 | ✅ | ❌ |
| 후발대 | ❌ | ✅ |

---

## 2. 행정사이트 할 일 (TODO)

- [ ] **노드 생성/쓰기**: 위 `partialAttendances` 스키마로 저장.
- [ ] **입력 UI**: 학생 명단/관리 화면에서 학생별 `선복귀`/`후발대` 지정(기본=미지정=본대). 예외만 찍는 방식 권장.
- [ ] **표시**: 행정에서도 1일차/3일차 출발 명단·인원수를 위 공식으로 계산해 노출.
- [ ] **보안 규칙**: `partialAttendances`는 행정이 쓰고, 이가드(허용 계정)는 **읽기 가능**하도록 Firebase 규칙 확인.

---

## 3. 이가드사이트 — 구현 완료 ✅ (소비 측)

이가드는 이미 이 계약대로 **읽고 반영**합니다. 행정이 노드를 채우면 자동 동작합니다.

- `src/lib/partialAttendance.ts` — 공유 공식 `isPresentOnDay(cls, day)`
- `src/lib/db.ts` — `subscribeToPartialAttendances` (읽기 전용 실시간 구독)
- `src/app/retreat/[id]/IguardClient.tsx` — 구독 후 뷰에 전달
- `src/app/retreat/[id]/ChecklistView.tsx` — 인원체크 1·3일차 명단·카운트 필터
- `src/app/retreat/[id]/BusesView.tsx` — 1·3일차 버스 인원수·자동배정 day-aware

노드가 비어 있으면 전원 본대로 간주 → 기존 동작 유지(무해).

---

## 4. 기존 공유 계약 (참고)

이미 운영 중인 행정→이가드 공유 노드(이가드 읽기 전용):

| 노드 | 용도 |
|---|---|
| `retreats/{id}` | 수련회 메타(이름·연도·날짜) — 이가드 실시간 구독 |
| `classes/{year}` | 학생 명단. 키 형식 `{부}-{학년}-{반}`, uniqueKey `{buNum}_{studentId}` |
| `retreats/{id}/groups` | 조편성 (`bu`는 `"1부"`/`"2부"`) |
| `retreats/{id}/teachers` | 행정 DB의 전체 스탭/교사 참석 명단. 이가드 스탭 명단으로 읽기 전용 연동 |
| `retreats/{id}/rooms` | 방배정 |
| `retreats/{id}/periods` | 수련회 기간 |
| `retreats/{id}/milestones` | 준비 일정 — **양방향 공유**(둘 다 쓰기) |

> 이가드는 이 형태가 깨지면 런타임 경고 배너를 띄웁니다(`src/lib/compat.ts`). 행정에서 스키마를 바꾸면 이 문서와 `compat.ts`를 함께 갱신하세요.

### 4-1. 행정 스탭명단 연동 규칙

행정 사이트의 교사 참석 명단은 아래 노드를 단일 원천으로 사용합니다.

```
retreats/{id}/teachers/{teacherId} = {
  name: string,
  bu: "1부" | "2부" | "스탭",
  classKey: string,
  status: "전참" | "부분참" | "불참",
  note?: string,
  arrivalInfo?: string,
  transport?: string,
  idNumber?: string,
  source?: "attendance-db" | "manual-assistant" | "manual-retreat",
  originType?: "class-teacher" | "official-staff" | "assistant-staff" | "manual-teacher"
}
```

- 이가드는 이 노드를 **읽기 전용**으로 구독합니다.
- `status !== "불참"`이고 이름이 있는 항목을 이가드 스탭 명단에 자동 포함합니다.
- 이가드 자체 `retreats/{id}/iguard/staff`에 같은 이름이 있으면 이가드 값을 우선합니다.
- 자동 포함된 행정 스탭은 이가드에서 수정/삭제하지 않습니다. 수정은 행정 사이트 DB에서 합니다.
- 행정 스탭 이름이 조편성 `groups[].staff`에 들어 있으면 기본 역할은 `조스탭`, 아니면 `행정`으로 표시합니다.

#### 보조스탭 처리 원칙

- 출석부의 연도 공용 원본인 `teacherStaff/{year}` 는 **정식 스탭만** 둡니다.
- 수련회에만 함께 섬기는 보조스탭은 `retreats/{id}/teachers` 에만 저장합니다.
- 보조스탭은 다음처럼 구분합니다.

```
retreats/{id}/teachers/{teacherId} = {
  name: "...",
  bu: "스탭",
  classKey: "보조스탭",
  status: "전참" | "부분참" | "불참",
  source: "manual-assistant",
  originType: "assistant-staff"
}
```

- 이렇게 두면 `DB에서 불러오기`/출석부 동기화를 다시 해도 **보조스탭이 날아가지 않고**, 이가드는 정식 스탭과 보조스탭을 모두 같은 스탭 명단으로 읽을 수 있습니다.
