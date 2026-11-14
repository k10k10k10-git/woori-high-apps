// 우리틴즈 교적 다리(wooriteens-web 0074, docs/platform/hs-bridge.md) — 새친구 "교적에 접수"와 연도 원장.
// Supabase RPC 접근은 이 모듈에서만 한다(컴포넌트는 이 함수들만 부른다).
//
// 연도 원장(api.hs_year_mode)
//   legacy     — 옛 학생 출석부가 원장(2026까지). 새친구는 지금처럼 옛 명단(classes/{연도})에 직접 "출석부 반영".
//   wooriteens — 우리틴즈가 원장(2027부터). 새친구는 교적 접수 대기로 보내고(api.hs_newcomer_submit_full, 우리틴즈 0093), 교적 행정팀이 등록·반 배정을 한다.
//                2026-11-14 결정(우리틴즈 DECISIONS 63 "모두 우리틴즈"): 바나바 일(1·2주차·등록 결정)도 우리틴즈 새친구 화면에서 한다.
//                그래서 보낼 때 1·2주차·등록 결정을 요구하지 않고(배정 반만), 바나바 칸·만남 날짜·메모·연락처를 함께 넘긴다.
//                classes/{연도}·attendance/{연도}는 우리틴즈가 채우는 읽기 사본이라 이 화면은 그곳에 쓰지 않는다.
import { getSupabase } from "@/lib/supabase";
import { deriveNewFriendRosterProgress, newFriendRegisteredDate, type NewFriendRosterProgress } from "./newFriend";
import type { NewFriend, NewFriendPrivate } from "./types";

export type YearLedger = "legacy" | "wooriteens";
export type RegistryStage = "none" | "submitted" | "registered" | "cancelled" | "dismissed";

/** api.hs_newcomer_status 의 한 줄. 이름·연락처는 없다. */
export interface RegistryState {
  stage: RegistryStage;
  year?: number;
  submittedClassKey?: string;
  classKey?: string;
  classLabel?: string;
  firstAttended?: string;
  personId?: string;
  personLink?: "linked" | "existing" | "conflict";
  submittedAt?: string;
  registeredAt?: string;
  cancelledAt?: string;
  existing?: boolean;
  /** hs_newcomer_submit_full: 규칙에 안 맞아 옮기지 못한 칸 이름(옛 꼴 연락처 등). 접수 자체는 됐다. */
  skipped?: string[];
}

export interface RegistrySubmission {
  nfId: string;
  year: number;
  classKey: string;
  name: string;
  birthYear: number;
  birthDate: string | null;
  gender: string | null;
  school: string | null;
  firstVisitDate: string;
  birthYearEstimated: boolean;
  firstVisitClamped: boolean;
  /** 0093: 바나바 칸·만남 날짜·메모·연락처(없으면 null). 우리틴즈가 칸마다 다시 확인하고 안 맞는 칸만 뺀다. */
  barnabas: string | null;
  inviter: string | null;
  faithStep: string | null;
  churchFriend: string | null;
  metFirstOn: string | null;
  metSecondOn: string | null;
  note: string | null;
  studentPhone: string | null;
  guardianPhone: string | null;
}

/** 우리틴즈로 보낼 수 있는지(2026-11-14): 배정 반이 있고 '미등록'이 아니면 된다. 1·2주차·등록 결정은 우리틴즈에서 이어서 한다. */
export function registryReadiness(friend: NewFriend): string | null {
  if (friend.decision === "미등록") return "등록하지 않기로 한 새친구는 보낼 수 없습니다.";
  if (!friend.assignedClassKey) return "배정 반을 먼저 선택해 주세요.";
  return null;
}

const NOTE_MAX = 500;
const ymd = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const text = (v: string | undefined) => v?.trim() || null;

/** 비고·가족사항·교역자 심방을 이름을 붙여 한 메모로(500자까지, 넘으면 자르고 "…"). */
export function combinedNote(priv: NewFriendPrivate): string | null {
  const parts = [["비고", priv.teamMemo], ["가족사항", priv.familyNotes], ["교역자 심방", priv.pastoralNotes]]
    .map(([label, value]) => (value?.trim() ? `${label}: ${value.trim()}` : ""))
    .filter(Boolean);
  if (!parts.length) return null;
  const joined = parts.join("\n");
  return joined.length > NOTE_MAX ? `${joined.slice(0, NOTE_MAX - 1)}…` : joined;
}

const NF_ID = /^[A-Za-z0-9_-]{1,64}$/;
const CLASS_KEY = /^[12]-[1-3]-[1-9][0-9]?$/;

/** 줄이 없을 때 DB 기본과 같은 원장(2026까지 legacy). 연결 실패 때 2026 이전 화면을 지금처럼 두는 데만 쓴다. */
export function defaultLedger(year: number): YearLedger {
  return year >= 2027 ? "wooriteens" : "legacy";
}

function validDate(y: number, m: number, d: number): string | null {
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * 새친구 비공개 기록의 생년월일 글자 → { date?, year? }.
 * 받는 모양: 2010-03-05, 2010.3.5, 2010/03/05, 20100305, 100305(앞 두 자리 연도), 2010.
 * 두 자리 연도는 기준 해의 끝 두 자리 이하면 2000년대, 크면 1900년대로 본다.
 */
export function parseBirth(value: string | undefined, referenceYear: number): { date?: string; year?: number } {
  const raw = (value ?? "").trim();
  if (!raw) return {};
  const parts = raw.match(/^(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?$/);
  if (parts) {
    const date = validDate(Number(parts[1]), Number(parts[2]), Number(parts[3]));
    return date ? { date, year: Number(parts[1]) } : {};
  }
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 8) {
    const date = validDate(Number(digits.slice(0, 4)), Number(digits.slice(4, 6)), Number(digits.slice(6, 8)));
    return date ? { date, year: Number(digits.slice(0, 4)) } : {};
  }
  if (digits.length === 6) {
    const yy = Number(digits.slice(0, 2));
    const y = yy <= referenceYear % 100 ? 2000 + yy : 1900 + yy;
    const date = validDate(y, Number(digits.slice(2, 4)), Number(digits.slice(4, 6)));
    return date ? { date, year: y } : {};
  }
  if (/^\d{4}$/.test(raw)) return { year: Number(raw) };
  return {};
}

/**
 * 교적 접수로 보낼 값. 접수 조건(등록 결정·1·2주차·배정 반)은 옛 출석부 반영과 같다.
 *   출생연도: 생년월일이 없으면 학년으로 짐작한다(그 해 고1 = 해 - 16). 짐작한 값은 birthYearEstimated 로 알린다.
 *   첫 방문일: 등록일. 교적은 그 해 날짜만 받으므로 지난해 등록이면 그 해 1월 1일, 오늘보다 늦으면 오늘로 보낸다.
 */
export function buildRegistrySubmission(friend: NewFriend, priv: NewFriendPrivate, year: number, today: string): RegistrySubmission | { error: string } {
  const invalid = registryReadiness(friend);
  if (invalid) return { error: invalid };
  if (!NF_ID.test(friend.id)) return { error: "새친구 기록 ID 모양이 달라 교적에 보낼 수 없습니다. 관리자에게 알려 주세요." };
  const classKey = friend.assignedClassKey ?? "";
  if (!CLASS_KEY.test(classKey)) return { error: "배정 반 모양이 달라 교적에 보낼 수 없습니다. 배정 반을 다시 골라 주세요." };
  const name = friend.name.trim();
  if (name.length < 2 || name.length > 40) return { error: "이름은 2~40자여야 교적에 보낼 수 있습니다." };
  const birth = parseBirth(priv.birth, year);
  const grade = Number(friend.grade);
  const estimatedYear = grade >= 1 && grade <= 3 ? year - 15 - grade : null;
  const birthYear = birth.year ?? estimatedYear;
  if (!birthYear) return { error: "생년월일이나 학년이 있어야 교적에 보낼 수 있습니다." };
  const registered = newFriendRegisteredDate(friend);
  const yearStart = `${year}-01-01`;
  let firstVisitDate = /^\d{4}-\d{2}-\d{2}$/.test(registered) ? registered : today;
  let firstVisitClamped = false;
  if (firstVisitDate < yearStart) { firstVisitDate = yearStart; firstVisitClamped = true; }
  if (firstVisitDate > today) { firstVisitDate = today; firstVisitClamped = true; }
  return {
    nfId: friend.id,
    year,
    classKey,
    name,
    birthYear,
    birthDate: birth.date ?? null,
    gender: friend.gender === "남" || friend.gender === "여" ? friend.gender : null,
    school: friend.school?.trim() || null,
    firstVisitDate,
    birthYearEstimated: birth.year === undefined,
    firstVisitClamped,
    barnabas: text(friend.owner),
    inviter: text(friend.inviter),
    faithStep: text(friend.faithStep),
    churchFriend: text(priv.churchFriend),
    metFirstOn: ymd(friend.week1Date),
    metSecondOn: ymd(friend.week2Date),
    note: combinedNote(priv),
    studentPhone: text(priv.phone),
    guardianPhone: text(priv.parentPhone),
  };
}

/** 우리틴즈 원장 해의 진행 상태: 교적 등록 = 완료, 교적 접수 = 처리중, 그 밖은 옛 판정(등록 결정·배정 반). */
export function deriveRegistryProgress(friend: NewFriend, state: RegistryState | undefined): NewFriendRosterProgress {
  if (state?.stage === "registered") return "완료";
  if (state?.stage === "submitted") return "처리중";
  return deriveNewFriendRosterProgress({ ...friend, rosterSync: undefined, giftDate: undefined });
}

/** 다시 보낼 수 있는 단계(아직 안 보냄, 취소함, 교적에서 정리됨). */
export function canSendToRegistry(state: RegistryState | undefined): boolean {
  return !state || state.stage === "none" || state.stage === "cancelled" || state.stage === "dismissed";
}

const ERROR_TEXT: Array<[RegExp, string]> = [
  [/class not found/, "우리틴즈 교적에 그 해 배정 반이 아직 없습니다. 교적에서 반 편성을 마친 뒤 다시 보내 주세요."],
  [/semester admin required/, "교적 접수는 통합관리자·행정팀·교역자만 할 수 있습니다."],
  [/legacy ledger year/, "이 해는 옛 학생 출석부가 원장입니다. 출석부 반영을 사용해 주세요."],
  [/already registered/, "교적에서 이미 등록했습니다. 소속 변경은 교적에서 해 주세요."],
  [/not submitted/, "교적에 접수된 기록이 없습니다. 목록을 새로고침해 주세요."],
  [/first visit/, "첫 방문일은 그 해 날짜여야 합니다."],
  [/birth date does not match/, "생년월일과 출생연도가 맞지 않습니다. 생년월일을 확인해 주세요."],
  [/name length/, "이름은 2~40자여야 합니다."],
  [/not signed in|member required/, "로그인 정보를 확인하지 못했습니다. 다시 로그인해 주세요."],
];

export function registryErrorText(message: string): string {
  for (const [pattern, text] of ERROR_TEXT) if (pattern.test(message)) return text;
  return "교적 연동 요청이 실패했습니다. 잠시 뒤 다시 시도해 주세요.";
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().schema("api").rpc(fn, args);
  if (error) throw new Error(registryErrorText(error.message ?? ""));
  return data as T;
}

/** 그 해 원장. 연결이 실패하면 2026 이전은 지금 화면(legacy)으로 두고, 2027 이후는 오류를 던진다(옛 명단에 잘못 쓰지 않게). */
export async function fetchYearLedger(year: number): Promise<YearLedger> {
  try {
    const mode = await rpc<{ ledger?: string }>("hs_year_mode", { p_year: year });
    if (mode?.ledger === "legacy" || mode?.ledger === "wooriteens") return mode.ledger;
    throw new Error("unknown ledger");
  } catch (error) {
    if (defaultLedger(year) === "legacy") return "legacy";
    throw error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * 교적 접수. 바나바 칸까지 함께 보내는 hs_newcomer_submit_full(우리틴즈 0093)을 먼저 부르고, 그 함수가 아직 없는 DB(0093 적용 전)면
 * 예전 hs_newcomer_submit 으로 기본 칸만 보낸다(그때는 바나바 칸을 우리틴즈에서 다시 적는다). 둘 다 권한·규칙·멱등은 같다.
 */
export async function submitNewFriendToRegistry(input: RegistrySubmission): Promise<RegistryState> {
  const base = {
    p_nf_id: input.nfId,
    p_year: input.year,
    p_class_key: input.classKey,
    p_name: input.name,
    p_birth_year: input.birthYear,
    p_birth_date: input.birthDate,
    p_gender: input.gender,
    p_school: input.school,
    p_first_visit_date: input.firstVisitDate,
    p_birth_year_estimated: input.birthYearEstimated,
  };
  const { data, error } = await getSupabase().schema("api").rpc("hs_newcomer_submit_full", {
    ...base,
    p_barnabas: input.barnabas,
    p_inviter: input.inviter,
    p_faith_step: input.faithStep,
    p_church_friend: input.churchFriend,
    p_met_first_on: input.metFirstOn,
    p_met_second_on: input.metSecondOn,
    p_note: input.note,
    p_student_phone: input.studentPhone,
    p_guardian_phone: input.guardianPhone,
    p_guardian_relation: null,
  });
  if (!error) return data as RegistryState;
  if (error.code === "PGRST202" || /Could not find the function/.test(error.message ?? "")) return rpc<RegistryState>("hs_newcomer_submit", base);
  throw new Error(registryErrorText(error.message ?? ""));
}

const SKIPPED_LABEL: Record<string, string> = {
  barnabas: "바나바 담당", inviter: "인도자", faith_step: "신급", church_friend: "교회 안 지인", met_first_on: "1주차", met_second_on: "2주차",
  note_trimmed: "메모(500자 넘어 잘림)", student_phone: "본인 연락처", guardian_phone: "보호자 연락처", guardian_relation: "보호자 관계",
};

/** 옮기지 못한 칸을 사람이 읽는 말로. 없으면 빈 글. */
export function skippedText(skipped: string[] | undefined): string {
  const names = (skipped ?? []).map((k) => SKIPPED_LABEL[k] ?? k);
  return names.length ? `옮기지 못한 칸: ${names.join(", ")}. 우리틴즈 새친구 화면에서 다시 적어 주세요.` : "";
}

export function cancelNewFriendRegistry(nfId: string): Promise<RegistryState> {
  return rpc<RegistryState>("hs_newcomer_cancel", { p_nf_id: nfId });
}

/** 새친구 id 목록의 교적 단계(500개씩). */
export async function fetchRegistryStates(ids: string[]): Promise<Record<string, RegistryState>> {
  const valid = [...new Set(ids.filter((id) => NF_ID.test(id)))];
  const out: Record<string, RegistryState> = {};
  for (let i = 0; i < valid.length; i += 500) {
    Object.assign(out, await rpc<Record<string, RegistryState>>("hs_newcomer_status", { p_nf_ids: valid.slice(i, i + 500) }));
  }
  return out;
}
