// semester-app 전체 타입 정의

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
}

export type SessionType = "정규" | "휴강" | "행사";

export interface Session {
  id: string;
  date: string; // YYYY-MM-DD
  type: SessionType;
  label?: string; // "개강예배", "종강예배" 등
}

export type ApplicationStatus = "접수" | "배치" | "취소";

export interface Application {
  id: string; // appKey = "{buNum}_{studentId}"
  studentId: string;
  bu: string; // "1부" | "2부"
  grade: number;
  class: number;
  name: string;
  choice1?: string; // teamId
  choice2?: string;
  trainingOnly?: boolean; // 훈련만 신청 (사역팀 배치 제외)
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

export interface AttendanceEntry {
  s: AttendanceStatus;
  by?: string;
  at?: string;
}

// 회차별 출석 맵: appKey → entry (노드 없음 = 미기록)
export type SessionAttendance = Record<string, AttendanceEntry>;

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
}

export interface CurriculumEntry {
  plan: string;
  note?: string;
}

// classes/{year} 읽기용 (학생 출석부 앱 소유 스키마)
export interface ClassStudent {
  name: string;
  num?: number;
  phone?: string;
  jang?: boolean; // 장결자
}

export interface ClassInfo {
  classKey: string; // "1-2-3" = 1부 2학년 3반
  teacher?: string;
  students: Record<string, ClassStudent>;
}
