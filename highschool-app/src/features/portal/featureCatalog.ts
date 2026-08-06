export const SEMESTER_TABS = [
  "신청",
  "배치",
  "출석",
  "수료",
  "커리큘럼",
  "아카이브",
  "설정",
] as const;

export const RETREAT_TAB_GROUPS = [
  {
    label: "명단",
    tabs: [
      { label: "신청 접수", idx: 0 },
      { label: "반별 명단", idx: 7 },
      { label: "입금 대조", idx: 12 },
      { label: "취소·환불", idx: 9 },
    ],
  },
  {
    label: "편성",
    tabs: [
      { label: "조편성", idx: 1 },
      { label: "방배정", idx: 2 },
      { label: "교사 참석", idx: 4 },
    ],
  },
  {
    label: "이동·참석",
    tabs: [
      { label: "부분 참석", idx: 6 },
      { label: "카풀·자차", idx: 5 },
    ],
  },
  {
    label: "물품·비용",
    tabs: [
      { label: "여행자 보험", idx: 8 },
      { label: "단체티", idx: 13 },
      { label: "구매 물품", idx: 10 },
      { label: "물품 재고", idx: 16 },
      { label: "식사 인원", idx: 15 },
    ],
  },
  {
    label: "현장",
    tabs: [
      { label: "현장 등록", idx: 11 },
      { label: "건강 특이사항", idx: 3 },
      { label: "의료 일지", idx: 14 },
    ],
  },
] as const;

export const IGUARD_VIEW_GROUPS = [
  {
    label: "실행",
    hint: "현장·모바일",
    views: [
      { key: "cue", label: "개인 큐카드", icon: "📋" },
      { key: "board", label: "포스트 현황", icon: "📍" },
      { key: "rooms", label: "조별 정보", icon: "👥" },
      { key: "lodging", label: "숙소 안내", icon: "🗺️" },
      { key: "check", label: "인원체크", icon: "✅" },
    ],
  },
  {
    label: "기획",
    hint: "PC",
    views: [
      { key: "overview", label: "전체 개요" },
      { key: "schedule", label: "스탭 전체 큐싯" },
      { key: "leadercue", label: "조장 큐싯" },
      { key: "posts", label: "포스트 편집" },
      { key: "staff", label: "스탭" },
      { key: "movements", label: "동선 매트릭스" },
      { key: "validate", label: "데이터 검증" },
      { key: "groupstaff", label: "조스탭 배정" },
      { key: "gbs", label: "GBS 장소" },
      { key: "badge", label: "명찰카드" },
      { key: "meals", label: "식사순서" },
      { key: "buses", label: "버스배정" },
      { key: "seating", label: "집회자리" },
      { key: "lodgingmap", label: "숙소 배치도" },
    ],
  },
  {
    label: "정보",
    hint: "",
    views: [
      { key: "guide", label: "조스탭 가이드" },
      { key: "todos", label: "준비 할일" },
    ],
  },
] as const;

export const UNIFIED_ROUTES = [
  "/",
  "/semesters",
  "/semester/[id]",
  "/retreats",
  "/retreat/[id]",
  "/field",
  "/retreat/[id]/field",
] as const;
