export type MonthlyMinistry = {
  month: number;
  curriculum: string;
  focus: string[];
};

export type MinistryGuideSection = {
  id: string;
  category: "예배·목양" | "훈련·리더십" | "수련회" | "행정·소통" | "특별사역";
  title: string;
  summary: string;
  sourceNote: string;
  principles: string[];
  checklist: string[];
  caution?: string;
};

export const MINISTRY_THEME = {
  title: "Glorify the LORD — 그의 이름을 높이세",
  verse: "나와 함께 여호와를 광대하시다 하며 함께 그의 이름을 높이세 · 시편 34편 3절",
  status: "2026 사역계획 가안 기준",
} as const;

export const MONTHLY_MINISTRIES: MonthlyMinistry[] = [
  { month: 1, curriculum: "겨울수련회 주제설교 · 기독론", focus: ["겨울수련회 학생 참여 독려"] },
  { month: 2, curriculum: "왕의 자녀 서약식 · 리더십수련회", focus: ["교사심방", "신입교사 심방", "교사 대심방"] },
  { month: 3, curriculum: "한 구절 묵상 · 상반기 웨이크업", focus: ["훈련·사역팀 개강", "학부모 기도회"] },
  { month: 4, curriculum: "한 구절 묵상", focus: ["고난주간·부활절", "시험기간 격려"] },
  { month: 5, curriculum: "친구 초청 · 한 영혼 전도", focus: ["전도축제"] },
  { month: 6, curriculum: "기독교 세계관 시리즈", focus: ["상반기 피크닉 데이", "시험기간 격려", "학부모 기도회"] },
  { month: 7, curriculum: "여름수련회 주제설교 · 사도행전", focus: ["여름수련회 학생 참여 독려"] },
  { month: 8, curriculum: "제주 국내선교 · 성경적 성교육", focus: ["선교·수련회 사후 관리", "성과 이성교제 설교"] },
  { month: 9, curriculum: "훈련·사역 개강 · 하반기 웨이크업", focus: ["훈련·사역팀 개강", "학부모 기도회"] },
  { month: 10, curriculum: "학교 심방 · 학교기도회", focus: ["하반기 피크닉 데이", "새친구 파티", "철야기도회"] },
  { month: 11, curriculum: "수험생 축복예배", focus: ["수험생 목양", "수능기도회"] },
  { month: 12, curriculum: "크리스마스 섬김 프로젝트", focus: ["시험기간 격려", "연말·신년 준비"] },
];

export const MINISTRY_GUIDE_SECTIONS: MinistryGuideSection[] = [
  {
    id: "sunday-worship",
    category: "예배·목양",
    title: "주일예배 운영",
    summary: "예배와 분반이 끊기지 않도록 시간·담당·다음 행동을 한 흐름으로 확인합니다.",
    sourceNote: "2025 주보 · 주일예배 큐싯 · 분반 교안",
    principles: [
      "1부 09:25, 2부 11:25 · 드림센터 602호",
      "찬양 → 대표기도 → 말씀봉독 → 설교 → 봉헌 → 주기도문",
      "예배 후 반별 공과 모임 참여를 기본 흐름으로 안내",
      "다음 주 대표기도와 이번 주 반미팅·복음반 여부를 함께 고지",
    ],
    checklist: ["예배 세팅과 팀별 담당 확인", "대표기도·말씀·미디어 큐 확인", "분반 교안과 장소 확인", "휴회·변경 사항 공지"],
  },
  {
    id: "pastoral-care",
    category: "예배·목양",
    title: "출석과 목양 관리",
    summary: "출석 숫자에 머물지 않고 연락·기도·심방으로 이어지는 목양 리듬을 만듭니다.",
    sourceNote: "출석부 · 양육카드 · 월간 양육보고서",
    principles: [
      "월간 출석을 A(매주)·B(1회 결석)·C(2~3회 결석)·D(전회 결석)로 점검",
      "교사의 문자·카톡, 기도, 전화 심방 횟수를 함께 돌아보기",
      "평소 잘 출석하던 학생이 3주 연속 결석하면 교역자 심방 요청",
      "장기결석 기준은 6개월 이상 연속 미출석 등 별도 기준으로 관리",
    ],
    checklist: ["이번 달 출석 등급 확인", "결석 이유 확인", "연락·기도·심방 기록", "교역자 심방·중보기도 요청 전달"],
    caution: "학생 연락처·주소·가정 특이사항은 권한이 있는 원본 화면에서만 확인하고 가이드나 공지에 복사하지 않습니다.",
  },
  {
    id: "training-teams",
    category: "훈련·리더십",
    title: "훈련·사역팀 운영",
    summary: "선발보다 학생의 자기결단과 성장을 돕는 학기 운영 원칙입니다.",
    sourceNote: "사역팀 수료증 · 면담 질문 · 팀 나눔지",
    principles: [
      "3월 개강·6월 수료, 9월 개강·11월 수료예배의 학기 리듬",
      "면담은 떨어뜨리기보다 사역에 임하는 마음을 정립하도록 돕는 대화",
      "지원동기·은사·성실함·경건생활·순종·기대·기도제목을 함께 확인",
      "말씀 묵상 → 사역 이유와 태도 → 적용 → 기도제목의 중간 점검",
    ],
    checklist: ["모집·면담 일정 공지", "학생의 지원동기와 기대 확인", "부모님 안내·동의 절차 확인", "중간 나눔과 수료 기준 점검"],
  },
  {
    id: "retreat-operations",
    category: "수련회",
    title: "수련회 현장 운영",
    summary: "조 단위 이동과 표준화된 인원 보고로 현장의 혼선을 줄입니다.",
    sourceNote: "겨울수련회 조장 큐싯 · 행정시트 · 버스 자료",
    principles: [
      "조 편성은 주일 반과 별개이며 교사·조장·부조장 역할을 명확히 지정",
      "인원 보고는 ‘N조 교사 N명, 학생 N명, 총 N명’ 형식으로 통일",
      "식사와 이동은 조 단위로 진행하고 개별 이동을 피함",
      "선발대·본대·후발대와 총괄·버스·인솔·접수 역할을 출발 전에 확정",
    ],
    checklist: ["조 명단·명찰·깃발·가방 준비", "1차·최종 인원체크", "미도착자 연락과 지각자 동선 확인", "마지막 날 조 물품 반납"],
  },
  {
    id: "retreat-feedback",
    category: "수련회",
    title: "수련회 피드포워드",
    summary: "반복된 현장 피드백을 다음 기획의 사전 점검표로 사용합니다.",
    sourceNote: "2025·2026 교사·스탭 수련회 피드백",
    principles: [
      "소수만 참여하는 프로그램보다 모든 학생이 참여하는 구조 우선",
      "일정 지연이 GBS와 기도 시간을 잠식하지 않도록 보호 시간 확보",
      "첫 GBS는 관계 형성·기도제목 나눔으로 시작하는 안을 우선 검토",
      "스탭의 과도한 통제와 교사의 현장 이탈을 함께 예방",
      "불필요한 이동·대기 반복을 줄이고 실제 휴식 시간을 확보",
    ],
    checklist: ["은혜의 결정적 장면 기록", "빼거나 더할 프로그램 제안", "행정·운영 방해 요인 기록", "섬김이 격려와 다음 액션 지정"],
  },
  {
    id: "administration",
    category: "행정·소통",
    title: "행정·정산 기본",
    summary: "배정·등록·증빙을 다시 찾을 수 있는 형식으로 남깁니다.",
    sourceNote: "행정팀 매뉴얼 · 정산명세서",
    principles: [
      "새친구는 1·2주차 과정을 확인한 뒤 반배정 여부를 결정",
      "관계상 분리가 필요한 학생·교사 정보는 배정 과정에서 제한적으로 반영",
      "지출내역은 날짜_사역명_품목 상세(용량·수량) 형식으로 기록",
      "영수증과 증빙은 민감정보 노출을 점검한 뒤 보관",
    ],
    checklist: ["담당자와 마감일 지정", "명단·배정 변경 이력 확인", "지출 분류와 증빙 연결", "민감정보 접근 범위 확인"],
    caution: "관계·가정·건강 관련 기록은 필요한 담당자만 최소 범위로 열람합니다.",
  },
  {
    id: "announcements",
    category: "행정·소통",
    title: "공지 작성 규칙",
    summary: "따뜻하지만 빠뜨림 없는 5단 공지 구조를 사용합니다.",
    sourceNote: "공지 말투 규칙 · 주보 모집 광고",
    principles: [
      "인사 → 배경 한 줄 → 핵심 정보 → 마감 강조 → 감사 인사",
      "원문의 정보는 누락하지 않고 어순과 구조만 정리",
      "이모지는 항목 머리에만 하나씩, 강조는 마감·금액·대상에만 사용",
      "딱딱한 회사 공지보다 정중하고 따뜻한 공동체 어투 유지",
    ],
    checklist: ["대상·일정·장소", "비용·신청 방법", "마감일과 D-day", "문의 담당자", "협조 요청과 감사"],
  },
  {
    id: "special-ministries",
    category: "특별사역",
    title: "특별사역 운영 흐름",
    summary: "전도·수험생·학세입·선교를 단발 행사가 아닌 전후 과정으로 봅니다.",
    sourceNote: "전도축제 · 수험생 사역 · 학습·세례·입교 · 제주 국내선교",
    principles: [
      "전도축제: 토론 → 태신자 작정 → 노방전도 → 초청 준비 → 축제 → 후속 목양",
      "수험생: D-30 격려 → 출정예배 → 수능기도회 → 축복예배 → 졸업여행",
      "학습·세례·입교: 신청 → 교육·문답 → 예식 당일 운영과 후속 확인",
      "국내선교: 관계 형성 → 파티 초대 → 손편지 집회 초청 → 기억에 남는 선물",
    ],
    checklist: ["사전 안내와 신청", "학생 참여 역할 설계", "현장 담당·동선 확인", "행사 후 관계·목양 후속조치"],
  },
];

export function getMonthlyMinistry(month: number) {
  return MONTHLY_MINISTRIES.find((item) => item.month === month) ?? MONTHLY_MINISTRIES[0];
}
