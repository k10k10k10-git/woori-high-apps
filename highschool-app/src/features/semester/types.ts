// 학기 사역 타입 정의 (구 semester-app에서 이어받음)

export interface SemesterMeta {
  title: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;
  completionRule: { minRate: number }; // 출석점수 비율(0~1) — 기본 0.7
  createdAt: string;
}

export interface Semester {
  id: string; // "2026-1"
  meta: SemesterMeta;
}

export interface Team {
  id: string;
  name: string;
  color: string; // Tailwind 파스텔 클래스 (예: "bg-blue-100")
  room?: string;
  order: number;
  goal?: string; // 이번 학기 팀 목표 (커리큘럼 탭 상단)
}

/** 훈련 반 — 사역팀과 별개 축. 모든 학생은 훈련을 거쳐 사역팀에 지원한다(고3 2학기 예외). */
export interface TrainingClass {
  id: string;
  name: string;
  color: string;
  room?: string;
  teacher?: string;
  order: number;
}

export type SessionType = "정규" | "휴강" | "행사";

export interface Session {
  id: string;
  date: string; // 시작일 YYYY-MM-DD (기존 단일 날짜 회차와 호환)
  endDate?: string; // 선택 종료일 YYYY-MM-DD — 1박 2일도 출석 회차는 하나로 유지
  type: SessionType;
  label?: string; // "개강예배", "종강예배" 등
}

export type ApplicationStatus = "접수" | "배치" | "취소";

export interface Application {
  id: string; // appKey = "{buNum}_{studentId}"
  studentId: string;
  personId?: string;
  bu: string; // "1부" | "2부"
  grade: number;
  class: number;
  name: string;
  choice1?: string; // teamId
  choice2?: string;
  trainingClassId?: string; // 훈련 반 (없으면 훈련 미신청 — 고3 2학기·스탭만 가능)
  trainingOnly?: boolean; // 훈련만 신청 (사역팀 배치 제외) — intakeRule.deriveTrainingOnly가 파생
  status: ApplicationStatus;
  teamId?: string; // 배치 결과
  createdAt: string;
  createdBy?: string;
}

// 🔒 semestersPrivate 아래에만 저장
export interface ApplicationPrivate {
  motive?: string; // 지원 동기
  wish?: string; // 하고 싶은 활동
  phone?: string;
  parentPhone?: string;
  memo?: string;
}

export type AttendanceStatus = "출석" | "지각" | "결석";
export type SemesterAttendanceScope = "team" | "training";

export interface AttendanceEntry {
  s: AttendanceStatus;
  by?: string;
  at?: string;
  /** 찬양팀 서버가 같은 요청의 재시도를 판별하는 비식별 작업 증거. 일반 입력에서는 없음. */
  praiseOperationId?: string;
  praiseOperationFingerprint?: string;
}

// 회차별 출석 맵: appKey → entry (노드 없음 = 미기록)
export type SessionAttendance = Record<string, AttendanceEntry>;
export type AttendanceByScope = Record<SemesterAttendanceScope, Record<string, SessionAttendance>>;

export interface CompletionEntry {
  certPrinted?: boolean;
  photoChecked?: boolean;
  reprint?: boolean;
  note?: string;
}

export interface ArchiveLink {
  id: string;
  title: string;
  url: string;
  kind: "doc" | "sheet" | "drive" | "video" | "etc";
  filePath?: string;
  fileName?: string;
  fileSize?: number;
}

export interface CurriculumEntry {
  plan: string;
  note?: string;
}

// teacherStaff/{year} 읽기용 (교사·스탭 출석부 앱 소유 스키마) — 접수 대상에 스탭 포함
export interface StaffPerson {
  staffId: string; // teacherStaff 노드키 (인물 단위 안정 키)
  personId?: string;
  name: string;
  title?: string;
  phone?: string;
}

// classes/{year} 읽기용 (학생 출석부 앱 소유 스키마)
export interface ClassStudent {
  id?: string;
  personId?: string;
  name: string;
  num?: number;
  birth?: string;
  phone?: string;
  pphone?: string;
  school?: string;
  addr?: string;
  jang?: boolean; // 장결자
}

export interface ClassInfo {
  classKey: string; // "1-2-3" = 1부 2학년 3반
  teacher?: string;
  students: Record<string, ClassStudent>;
}

export type NewFriendDecision = "미정" | "등록" | "보류" | "미등록";

export interface NewFriendRosterSync {
  studentId: string;
  personId?: string;
  classKey: string;
  syncedAt: string;
  syncedBy?: string;
}

/** 공개 운영 정보 — 연락처·주소·가족·심방 내용은 NewFriendPrivate로 분리한다. */
export interface NewFriend {
  id: string;
  name: string;
  part: "1부" | "2부";
  gender?: "남" | "여";
  school?: string;
  grade: number;
  owner?: string;
  decision: NewFriendDecision;
  week1Date?: string;
  week2Date?: string;
  /** 운영 화면에서 수정할 수 있는 새친구 접수일(YYYY-MM-DD). createdAt 감사 시각과 분리한다. */
  registeredDate?: string;
  inviter?: string;
  faithStep?: string;
  assignedClassKey?: string;
  giftDate?: string;
  createdAt: string;
  createdBy?: string;
  updatedAt?: string;
  rosterSync?: NewFriendRosterSync;
}

/** 🔒 semestersPrivate 아래에만 저장한다. */
export interface NewFriendPrivate {
  birth?: string;
  phone?: string;
  parentPhone?: string;
  address?: string;
  churchFriend?: string;
  teamMemo?: string;
  familyNotes?: string;
  pastoralNotes?: string;
}

export type NewFriendStage =
  | "접수"
  | "1주차"
  | "2주차"
  | "등록 결정"
  | "반배정"
  | "출석부 반영"
  | "완료"
  | "보류"
  | "종료";
