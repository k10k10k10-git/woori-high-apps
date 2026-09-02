// ════════════════════════════════════════════════════════════
// 행정 모듈 소유 타입 — 읽기 전용으로만 소비 (구 retreat-app, 2026-08-05 통합)
// 형태는 src/lib/types.ts 와 동일해야 함 (단일 원천)
// ════════════════════════════════════════════════════════════

export interface Retreat {
  id: string;
  name: string;
  year: number;
  createdAt?: number; // 행정 사이트에서 생성 시각 기록 — 최신순 정렬에 사용
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  groupCount?: number;
}

export interface Student {
  id: string;          // uniqueKey = `${buNum}_${studentId}`
  name: string;
  num: number;
  grade: number;
  class: number;
  buNum?: number;      // 1=1부, 2=2부
  birth?: string;
  phone?: string;
  pPhone?: string;
}

export interface ClassData {
  teacher?: string;
  students?: Record<string, { name: string; num?: number; phone?: string }>;
}

export interface Participant {
  name: string;
  gender: string;
  grade: number;
  class: number;
  bu: string;          // "1부" | "2부"
  studentId?: string | null;
}

export interface TeacherAttendance {
  id: string;
  name: string;
  bu: string; // "1부" | "2부" | "스탭"
  classKey: string;
  status: "전참" | "부분참" | "불참";
  note?: string;
  arrivalInfo?: string;
  transport?: string;
  gender?: "남" | "여"; // 행정 교사 참석에서 관리. 없으면 반 정보로 하위호환 추론
  idNumber?: string;
  // 이가드 스탭 보강 필드 (행정에서 관리, 이가드 읽기 전용)
  age?: string | null;
  role?: string | null;
  corps?: "선발대" | "본대" | "후발대";
  lateArrival?: string | null;
  programTeam?: string | null;
  worship?: boolean;
  source?: "attendance-db" | "manual-assistant" | "manual-retreat";
  originType?: "class-teacher" | "official-staff" | "assistant-staff" | "manual-teacher";
  originKey?: string;
}

/** 행정 부분참석 탭의 학생별 분류 — IGuard는 버스 탑승 판정을 위해 note도 보존해 읽는다. */
export interface PartialAttendanceInfo {
  type: "선복귀" | "후발대" | "당일참석";
  day?: number;   // 당일참석 전용 — 참석 일차 (1~3)
  note?: string;
  updatedAt?: number;
}

export type PartialAttendanceMap = Record<string, PartialAttendanceInfo>;

export interface Group {
  id: string;
  name: string;        // "1조", "2조"...
  bu: string;          // "1부" | "2부"
  teachers: string[];
  leader: string;
  studentIds: string[];
  gbs?: string;
  staff?: string;
}

export interface Room {
  id: string;
  dong?: string;       // 동/건물 (숙소 건물 여러 개 — 행정에서 기록, 없으면 단일 건물)
  roomNumber: string;
  capacity: number;
  type: string;        // "남" | "여"
  studentIds: string[];
  teachers?: string[];
}

// 준비 일정(행정 사이트와 이가드가 공유)
export interface RetreatPeriod {
  id: string;
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD
  theme?: string;
  label?: string;      // 예: "1부", "2부"
}

export interface Milestone {
  id: string;
  title: string;
  targetDate: string;  // YYYY-MM-DD
  done: boolean;
  note?: string | null;
  createdAt?: number;
  updatedAt?: number;
  sourceSite?: "retreat-admin" | "move-guide" | string;
}

// ════════════════════════════════════════════════════════════
// 이가드 앱 소유 타입 — retreats/{id}/iguard/* 에만 저장
// ════════════════════════════════════════════════════════════

/** 식사 세션 — 조 배식 순서.
 *  조 목록 자체는 groups에서 파생하고, 순서만 여기 저장. */
export interface IguardMeal {
  id: string;
  label: string;   // 예: "토요일 점심"
  day: number;     // 일자 정렬용 (1/2/3)
  slot: number;    // 같은 날 내 끼니 순서 (아침0 점심1 저녁2 야식3)
  weight?: number | null; // (미사용·하위호환) 예전 '앞순서 효용 가중치'. 평균순위 편차를 키워 공정배정에서 제거됨(fairAssign.ts ⚖ 참조)
  pinnedFront?: string | null; // 이 끼니만 맨 앞 순서로 고정할 조. 예: "1조" 또는 "1조, 3조"(쉼표 순서대로 앞순서)
  entries: IguardMealEntry[];
  source?: "manual" | "cloned";
}

export interface IguardMealEntry {
  groupId: string;            // groups 노드의 그룹 id (단일 원천)
  seq: number;                // 배식 순서 (0부터)
  round?: "선밥" | "후밥";    // 레거시 — 미사용
}

/** 조별 GBS 장소. 조 목록은 행정 groups를 참조하고 장소만 이가드가 소유한다. */
export interface IguardGbsPlace {
  groupId: string;
  place: string;
  updatedAt?: number;
}

// ── 이가드 스탭 명단 (교사와 별개) ──────────────────────────
export interface IguardStaff {
  id: string;
  name: string;     // 예: "박세원sf"
  age?: string | null; // 예: "96", "00", "외부" — 타임테이블 스탭 명단 묶음 표시용
  role?: string;    // 예: "총괄", "층장"
  order?: number;
  corps?: "선발대" | "본대" | "후발대";
  lateArrival?: string | null;
  programTeam?: string | null;
  worship?: boolean;
  source?: "iguard" | "admin";
  adminStatus?: "전참" | "부분참" | "불참";
}

// ── 타임테이블: 일자별 시간 블록 ────────────────────────────
export interface IguardScheduleBlock {
  id: string;
  day: number;      // 1/2/3
  start: string;    // "HH:MM"
  end?: string;     // "HH:MM"
  label: string;    // 예: "점심 식사"
  meal?: boolean;   // 식사 블록 여부 (선밥/후밥 검증용)
  detail?: string | null;  // 이 시간대 공통 동선 상세(분 단위 타임라인) — 큐싯 "내용" 열
  owner?: string | null;   // 이 블록 담당(자유 텍스트) — 큐싯 "담당" 열. 예: "진행 총괄: 박세원sf"
  notice?: string | null;  // 기타/특이사항 — 큐싯 "기타", "유의사항" 열
  leaderNote?: string | null; // 조장용 내용 — 조장 큐싯("구분·시간·내용")의 내용 열
  noMovement?: boolean | null; // 동선 배정이 필요 없는 블록(검증 공백 경고 제외)
  note?: string | null; // 자유 메모 — 정리되지 않은 제작 메모를 시트 밖에서도 보존
  actualStart?: string | null; // 현장 실제 시작(HH:MM, 새벽은 24시+). 최신 진행 마커가 큐카드 현재 일정을 결정
  actualStartAt?: number | null; // 여러 블록 중 가장 최근에 누른 진행 마커 판정용 epoch ms
  source?: "sheet" | "manual" | "cloned";
}

/** 시간 블록 안의 이동 구간. 구간이 없는 레거시 블록은 화면에서 기본 구간으로 해석한다. */
export interface IguardSegment {
  id: string;
  blockId: string;
  order: number;
  label: string;
  zone?: "위" | "아래" | null;
  note?: string | null;
  source?: "sheet" | "manual" | "cloned";
}

// ── 포스트(통제 지점) 정의 ──────────────────────────────────
export interface IguardPost {
  id: string;
  name: string;     // 예: "강당 엘베 앞", "배식구", "4층 층장"
  area?: string;    // 예: "4층", "식당", "강당"
  source?: "manual" | "sheet" | "cloned";
}

export interface IguardLodgingHotspot {
  roomId: string;
  page: number;
  left: number;
  top: number;
}

/** 수련회마다 달라지는 숙소 PDF와 호실 핀. 파일 본문은 Storage, 메타데이터만 IGuard DB에 둔다. */
export interface IguardLodgingMap {
  id: string;
  label: string;
  building: string;
  fileName: string;
  fileUrl: string;
  filePath: string;
  pageCount?: number;
  hotspots?: Record<string, IguardLodgingHotspot>;
  createdAt?: number;
}

// ── 동선 매트릭스: 구간 × 포스트 × 스탭(또는 미정 슬롯) ──────
// 새 키 = `${segmentId}__${postId}__${staffId ?? `tbd${slot}`}`
// 레거시 키 `${staffId}__${blockId}`와 segmentId 없는 레코드는 2027 겨울수련회까지 읽는다.
export interface IguardMovement {
  id: string;
  segmentId?: string | null;
  blockId: string;         // 블록 단위 조회·레거시 호환용 비정규화
  postId: string;
  staffId?: string | null; // null = 담당 미정
  slot?: number;           // 담당 미정 슬롯 구분
  round?: "선밥" | "후밥";
  detail?: string | null;  // 괄호 상세: "1층", "A동 1,2층"
  actor?: string | null;   // 비스탭 주체: "행정팀", "이가드sf"
  note?: string;
  source?: "sheet" | "manual" | "cloned"; // 큐싯 자동배정과 현장 수동배정을 구분해 재동기화 시 수동배정을 보존
}

/** 기존 화면이 다루는, 실제 스탭이 지정된 동선. */
export type AssignedIguardMovement = IguardMovement & { staffId: string };

// ── 버스(호차) 배정 ─────────────────────────────────────────
export type BusStudentGender = "남" | "여";

/** 남녀 분리 자동배정의 최소 단위 — 한 조의 같은 성별 학생은 항상 함께 이동한다. */
export interface IguardBusSegment {
  groupId: string;
  gender: BusStudentGender;
  teacherNames?: string[]; // 교사별 성별을 적용한 실제 탑승 명단
  includeTeachers?: boolean; // 구버전 하위호환: true면 조 교사 전체
}

export interface IguardBus {
  id: string;
  busNo: number;
  day?: 1 | 3;          // 1일차 입소 / 3일차 퇴소
  capacity?: number;    // 인승 (없으면 45로 간주 — 기존 데이터 하위호환, busCapacityOf 사용)
  groupIds: string[];   // groups 노드 id (단일 원천)
  assignmentMode?: "gender"; // 없으면 기존 혼합(조 단위) 방식
  segments?: IguardBusSegment[]; // gender 방식일 때 조+성별 묶음
  staff?: string;       // 선탑/동승 스탭 명단 (자유 텍스트)
  note?: string;
}

// ── 인원체크 저장 상태 ─────────────────────────────────────
export interface IguardAttendance {
  id: string;            // encodeURIComponent(`${day}:${memberId}`)
  checked: boolean;      // false = 해제 톰스톤(삭제 대신 기록 — 오프라인 낡은 체크가 최신 해제를 덮지 못하게)
  updatedAt?: number;
  by?: string;           // 체크/해제한 사람 (스탭 이름 — 동시 사용 시 대조용)
}

/** 인원체크 상세 (구독에서 키별로 내려주는 부가 정보) */
export interface IguardAttendanceInfo {
  checked: boolean;
  updatedAt?: number;
  by?: string;
}

// ── 수련회별 추가 PIN 잠금 ────────────────────────────────
// Google 로그인·팀원 승인 뒤에 적용되는 이가드 UI 진입 장벽이다.
export interface IguardAccessLock {
  enabled: true;
  version: 1;
  algorithm: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  pinHash: string;
  updatedAt: number;
  updatedBy?: string;
}

// ── 집회 자리배치: 세션별 구역 → 조 ────────────────────────
export interface IguardSeatingZone {
  name: string;         // 예: "5층", "앞열"
  groupIds: string[];   // groups 노드 id
}
export interface IguardSeating {
  id: string;
  label: string;        // 예: "저녁 집회 1"
  day: number;
  order: number;
  avoidPairs?: string | null; // 같이 붙이면 안 되는 조 조건. 예: "1조-2조"
  layoutPattern?: string | null; // 열별 조 수. 예: "4*4", "333322", "3 3 4 4"
  pinnedFront?: string | null; // 이 집회만 맨 앞자리(첫 구역)로 고정할 조. 예: "1조" 또는 "1조, 3조"(쉼표 순서대로 앞자리)
  zoneWeights?: number[] | null; // 앞열부터 자리 효용 점수. 값이 클수록 좋은 자리로 계산.
  zones: IguardSeatingZone[];
  source?: "manual" | "cloned";
}

// ── 준비 할 일 (D-day 체크리스트) ───────────────────────────
export interface IguardTodo {
  id: string;
  title: string;
  done: boolean;
  owner?: string;
  due?: string;
  order?: number;
}

// 조스탭 가이드는 iguard/guide 에 string[] 로 저장 (기본값 db.ts)
