export interface Student {
  id: string;
  name: string;
  num: number;
  grade: number;
  class: number;
  buNum?: number;  // 1=1부, 2=2부
  birth: string;
  phone: string;
  pPhone: string;
  addr: string;
  photo: string;
  school: string;
}

export interface ClassData {
  teacher: string;
  students: Record<string, Student>;
}

export interface Participant {
  name: string;
  gender: string;
  grade: number;
  class: number;
  bu: string; // "1부" | "2부"
  studentId?: string | null; // matched Firebase ID
  registeredAt: string;
  phone?: string | null;
  pPhone?: string | null;
  extra?: string; // 특이사항
}

export interface Group {
  id: string;
  name: string; // "1조", "2조"...
  bu: string; // "1부" | "2부"
  teachers: string[];
  leader: string;
  studentIds: string[];
  gbs?: string; // GBS 장소 (예: "5012호")
  staff?: string; // 조 스태프
}

export interface TeacherAttendance {
  id: string;
  name: string;
  bu: string; // "1부" | "2부" | "스탭"
  classKey: string; // "1학년 1반" or 스탭 직함
  status: "전참" | "부분참" | "불참";
  note?: string;
  arrivalInfo?: string;
  transport?: string;
  idNumber?: string;
  age?: string;
  role?: string;
  corps?: "선발대" | "본대" | "후발대";
  lateArrival?: string;
  programTeam?: string;
  worship?: boolean;
  source?: "attendance-db" | "manual-assistant" | "manual-retreat";
  originType?: "class-teacher" | "official-staff" | "assistant-staff" | "manual-teacher";
  // 출석부 원본과의 안정적 연결 키 — 불러오기 재실행 시 개명/반변경에도 중복 생성 대신 갱신(upsert).
  //   반교사: `class:{부-학년-반}`,  공식스탭: `staff:{teacherStaff 노드키}`
  originKey?: string;
}

export interface CarPool {
  id: string;
  studentName: string;
  studentId?: string | null;
  grade: number;
  class: number;
  bu: string;
  phone?: string;
  pPhone?: string;
  desiredTime: string; // "금요일 오후" | "토요일 오전" | 기타
  location: string; // 픽업 장소
  teacherDriver?: string; // 배정된 교사
  note?: string;
}

export interface Room {
  id: string;
  roomNumber: string;
  capacity: number;
  type: string; // "남" | "여"
  studentIds: string[];
  teachers?: string[]; // 방에 배정된 교사 이름 목록
}

export interface Retreat {
  id: string;
  name: string;
  year: number;
  sheetId: string;
  sheetGid: string;
  createdAt: number;
  groupCount: number;
  startDate?: string; // YYYY-MM-DD 수련회 시작일
  endDate?: string;   // YYYY-MM-DD 수련회 종료일
}

export interface RetreatPeriod {
  id: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  theme?: string;
  label?: string;    // 예: "1부", "2부"
}

export interface Milestone {
  id: string;
  title: string;
  targetDate: string; // YYYY-MM-DD
  done: boolean;
  note?: string | null;
  createdAt?: number;
  updatedAt?: number;
  sourceSite?: string;
}

export interface PartialAttendance {
  id: string;
  type: "선복귀" | "후발대";
  note?: string;
  updatedAt?: number;
}

export interface AttendanceRecord {
  [sessionKey: string]: string; // "X" = present
}

export interface Cancellation {
  id: string;
  bu: "1부" | "2부";
  grade: number;
  class: number;
  name: string;
  phone?: string;
  reason?: string;
  account?: string; // 환불 계좌
  note?: string;
  paymentAmount?: number | null;
  studentKey?: string; // 신청자 취합 연동용 (buNum_studentId)
}

export interface SupplyItem {
  id: string;
  name: string;
  actualQty?: string;
  buyQty?: string;
  price?: number;
  link?: string;
  note?: string;
}

export interface SnackItem {
  id: string;
  category: string; // "첫째날 야식" | "둘째날 야식" | "스탭 간식" | "GBS 간식"
  name: string;
  qty?: string;
  unitPrice?: number; // 개당 단가 — 있으면 금액 = 수량(숫자 부분) × 단가로 자동 계산
  price?: number;
  link?: string;
  note?: string;
}

export interface BrainstormComment {
  id: string;
  author: string;
  text: string;
  createdAt: number;
}

export interface BrainstormNote {
  id: string;
  title?: string;        // 카드 제목 (선택)
  text: string;
  color: string;         // 스티키 노트 색상 키 (yellow/blue/green/pink/purple)
  author: string;        // 작성자 표시 이름
  createdAt: number;
  updatedAt?: number;
  x?: number;            // 캔버스 내 자유 배치 좌표 (px, 가상 캔버스 기준)
  y?: number;
  comments?: Record<string, Omit<BrainstormComment, "id">>;
}

export interface SuppliesBudget {
  supplyBudget?: number;              // 물품(행정물품 비용) 예산
  snackBudgets?: Record<string, number>; // 간식 카테고리별 예산 (첫째날 야식/둘째날 야식/스탭 간식/GBS 간식)
}

// ── 식수 계산 (끼니별 식사 인원 — 수련원 통보용) ─────────────────

export const MEAL_ROLES = ["staff", "teacher", "student", "extra"] as const;
export type MealRole = typeof MEAL_ROLES[number];
export type MealRoleCounts = Record<MealRole, number>; // 스탭/교사·교역자/학생/기타(음향·조명 등)

export interface MealSlot {
  id: string;
  date: string;   // YYYY-MM-DD
  name: string;   // "아침" | "점심" | "저녁" (자유 입력 가능)
}

// 후발/선복귀 조정 그룹 — 의미 필드는 라벨이 아니라 "첫 식사"/"마지막 식사" 끼니.
// 같은 그룹이라도 마지막 식사가 다르면(예: "학생은 저녁 먹고") 항목을 나눠 입력한다.
export interface MealAdjustment {
  id: string;
  type: "후발" | "선복귀";
  label: string;            // 예: "금 저녁 후발"
  counts: MealRoleCounts;
  mealId: string;           // 후발=첫 식사 끼니 id, 선복귀=마지막 식사 끼니 id
  note?: string;
}

export interface MealCountData {
  base?: MealRoleCounts;        // 기준 인원 (전원 참석 시)
  extraLabel?: string;          // 기타 인원 설명 (예: "음향/조명")
  meals?: MealSlot[];           // 끼니 목록 (기간에서 기본 생성 + 수동 편집)
  adjustments?: MealAdjustment[];
  updatedAt?: number;
}

// ── 입금 미매칭 ────────────────────────────────────────────

export interface UnmatchedPayment {
  id: string;
  payerName: string;             // 입금자 이름 (학부모 성함)
  note?: string;                 // 메모 (입금액, 기타)
  resolvedStudentKey?: string;   // 연결된 participants 키
  resolvedStudentName?: string;  // 연결된 학생 이름
  resolvedStudentGrade?: number;
  resolvedStudentClass?: number;
  resolvedStudentId?: string;    // cellColor 업데이트용 studentId
  resolvedAt?: string;
  createdAt: number;
}

// ── 단체티 신청 ────────────────────────────────────────────

export const TSHIRT_DESIGNS = ["1번", "2번", "3번", "4번"] as const;
export const TSHIRT_SIZES   = ["XS(85)", "S(90)", "M(95)", "L(100)", "XL(105)", "2XL(110)", "3XL(115)"] as const;
export type TshirtDesign = typeof TSHIRT_DESIGNS[number];
export type TshirtSize   = typeof TSHIRT_SIZES[number];

export interface TshirtOrder {
  id: string;
  name: string;
  grade: number;
  class: number;
  bu: string;
  design: string;
  size: string;
  source: "sheet" | "manual";
  note?: string;
  createdAt: number;
}

// ── 의료 일지 ──────────────────────────────────────────────

export interface MedicalLog {
  id: string;
  name: string;
  bu?: string;
  grade?: number;
  classNum?: number;
  symptoms: string;
  medicines: string[];   // 처방한 약 목록
  outcome: string;       // 처리 결과
  note?: string;
  createdAt: number;
}

// ── 현장 등록 ──────────────────────────────────────────────

export interface OnSiteEntry {
  isOnSite: boolean;       // false = 기존 신청자 체크인, true = 현장 추가 등록
  name: string;
  grade: number;
  class: number;
  bu: string;
  gender: string;
  registeredAt: string;
  participantKey?: string; // isOnSite=false 일 때 participants 의 키 (p_0, p_1…)
}
