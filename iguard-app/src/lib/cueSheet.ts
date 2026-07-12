import { IguardScheduleBlock, IguardStaff, IguardPost } from "@/lib/types";
import { parseBusStaff } from "@/lib/busStaff";

export type ScheduleDraft = {
  day: number;
  start: string;
  end: string;
  label: string;
  meal: boolean;
  detail: string;
  owner: string;
  notice: string;
};
export type ImportedBlock = Omit<IguardScheduleBlock, "id">;
export type ParsedCueSheet = {
  blocks: ImportedBlock[];
  staffDrafts: AutoStaffDraft[];
  busDrafts: AutoBusDraft[];
  importStats: {
    detailCount: number;
    ownerCount: number;
    noticeCount: number;
  };
  warnings: string[];
  dayCounts: Record<number, number>;
};
export type AutoAssignment = {
  staffId: string;
  postId: string;
  round?: "선밥" | "후밥";
  note?: string;
};
export type AutoPostDraft = {
  name: string;
  area?: string;
};
export type AutoStaffDraft = {
  name: string;
  role?: string;
};
export type AutoBusDraft = {
  day: 1 | 3;
  busNo: number;
  staff: string;
};

export const EMPTY: ScheduleDraft = { day: 1, start: "", end: "", label: "", meal: false, detail: "", owner: "", notice: "" };
const TIME_RE = /^([0-2]?\d|3[0-5]):[0-5]\d$/;
const TIME_IN_TEXT_RE = /([0-2]?\d|3[0-5]):[0-5]\d/g;
const OPEN_END = "~";

export function isValidTime(value?: string): boolean {
  return !value || TIME_RE.test(value);
}

export function normalizeTime(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^([0-2]?\d|3[0-5]):([0-5]\d)$/);
  if (!match) return trimmed;
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

export function normalizeEnd(value: string): string {
  const trimmed = value.trim();
  return trimmed === OPEN_END ? OPEN_END : normalizeTime(trimmed);
}

export function toMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

/** 자정 넘김·새벽 일정 정규화 — 24시+ 표기(패턴 11)로 통일한다.
 *  ① 종료<시작인 닫힌 블록: 종료를 +24h (예: 23:30~02:00 → 23:30~26:00). 시트에 사람이 읽는 02:00으로 적어도
 *     앱은 자정 넘김을 26:00으로 다뤄야 "지금" 판정(scheduleTime)이 새벽에도 맞는다.
 *  ② N일차(N≥2)의 새벽(<05:00) 블록: 전날(N-1)의 24시+ 표기로 이동
 *     (예: 2일차 00:30~03:00 → 1일차 24:30~27:00). 밤 프로그램은 전날 큐싯에 이어 붙는 현장 관행과 일치.
 *  05:00 경계: 수련회 기상은 06~07시라, 05시 이전 시작만 "전날 새벽"으로 본다(05:00+ 새벽기도 등은 당일 유지). */
export function resolveOvernight(
  day: number, start: string, end?: string,
): { day: number; start: string; end?: string; converted: boolean } {
  const s0 = toMinutes(start);
  if (!Number.isFinite(s0)) return { day, start, end, converted: false };
  let s = s0;
  const hasClosedEnd = !!end && end !== OPEN_END && Number.isFinite(toMinutes(end));
  let e = hasClosedEnd ? toMinutes(end!) : null;
  // ① 종료<시작 → 자정 넘김
  if (e != null && e < s) e += 24 * 60;
  // ② N일차 새벽 → 전날로 (start·end 모두 +24h, day-1)
  let d = day;
  let dawnShift = false;
  if (day >= 2 && s < 5 * 60) {
    d = day - 1;
    s += 24 * 60;
    if (e != null) e += 24 * 60;
    dawnShift = true;
  }
  // 표현 한계(36:00) 초과 = 비정상 입력 → 변환 취소하고 원본 유지(적어도 임포트는 되게)
  if (s >= 36 * 60 || (e != null && e >= 36 * 60)) return { day, start, end, converted: false };
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const outStart = fmt(s);
  const outEnd = e != null ? fmt(e) : end;
  const converted = dawnShift || (e != null && outEnd !== end);
  return { day: d, start: outStart, end: outEnd, converted };
}

export function scheduleTimeError(start: string, end?: string): string | null {
  if (!isValidTime(start)) return "시작 시간은 HH:MM 형식으로 입력해주세요. 예: 09:30";
  if (end === OPEN_END) return null;
  if (end && !isValidTime(end)) return "종료 시간은 HH:MM 형식으로 입력해주세요. 예: 10:30";
  if (end && toMinutes(end) <= toMinutes(start)) return "종료 시간은 시작 시간보다 늦어야 합니다. 자정을 넘는 일정은 26:00처럼 24시+ 표기를 사용해주세요.";
  return null;
}

export function timeRangeLabel(start: string, end?: string): string {
  if (!end) return start;
  return end === OPEN_END ? `${start}~` : `${start}~${end}`;
}

export function parseNames(value?: string): string[] {
  return (value || "")
    .split(/[,，、\n/]+/)
    .map(name => name.trim())
    .filter(Boolean);
}

export function scheduleSortValue(block?: IguardScheduleBlock): string {
  if (!block) return "99__99:99";
  return `${String(block.day).padStart(2, "0")}__${block.start}`;
}

export function postLabel(post?: IguardPost): string {
  if (!post) return "?";
  return post.area ? `[${post.area}] ${post.name}` : post.name;
}

export function ageSortValue(value: string): number {
  const trimmed = value.trim();
  if (trimmed === "미입력") return 9999;
  const match = trimmed.match(/^\d{1,2}$/);
  if (!match) return 9000;
  const n = Number(trimmed);
  return n >= 30 ? 1900 + n : 2000 + n;
}

export function looksLikeMeal(label: string, detail: string): boolean {
  return /식사|아침|점심|저녁|간식|배식/.test(`${label} ${detail}`);
}

/** 구글 시트 edit URL에서 sheetId\xB7gid 추출 */
export function parseSheetUrl(url: string): { sheetId: string; gid: string } | null {
  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!idMatch) return null;
  const gidMatch = url.match(/[#&?]gid=([0-9]+)/);
  return { sheetId: idMatch[1], gid: gidMatch ? gidMatch[1] : "0" };
}

function compactText(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function searchText(value: string): string {
  return value.toLowerCase().replace(/sf/gi, "").replace(/스탭/g, "").replace(/[\s_~\-\xB7()[\]{}.,!?:/\\|'"""‘’]+/g, "");
}

function parseDelimitedRows(raw: string): string[][] {
  const delimiter = raw.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const next = raw[i + 1];
    if (ch === "\"") {
      if (quoted && next === "\"") {
        cell += "\"";
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows
    .map(r => r.map(c => compactText(c)))
    .filter(r => r.some(Boolean));
}

function parseDayCell(value: string): number | null {
  const text = value.replace(/\s+/g, "");
  const match = text.match(/(\d+)(?:일차|일째날|일날)/);
  if (match) return Number(match[1]);
  if (/첫째날|첫날|1일/.test(text)) return 1;
  if (/둘째날|둘째|두번째날|2일/.test(text)) return 2;
  if (/셋째날|셋째|세번째날|3일/.test(text)) return 3;
  return null;
}

function parseTimeRange(value: string): { start: string; end?: string } | null {
  const normalized = value.replace(/\s+/g, " ").trim();
  const times = normalized.match(TIME_IN_TEXT_RE) ?? [];
  if (!times.length) return null;
  const start = normalizeTime(times[0]!);
  const end = times[1] ? normalizeTime(times[1]!) : normalized.includes(OPEN_END) ? OPEN_END : undefined;
  return { start, end };
}

function headerIndex(headers: string[], names: string[]): number {
  return headers.findIndex(h => names.some(name => h.replace(/\s+/g, "").includes(name)));
}

function isRepeatedHeader(row: string[]): boolean {
  const text = row.join(" ").replace(/\s+/g, "");
  return text.includes("구분") && text.includes("시간") && text.includes("내용");
}

function rowHasStaffText(value: string, staff: IguardStaff[]): boolean {
  const normalized = searchText(value);
  return /sf/i.test(value) || staff.some(s => s.name && normalized.includes(searchText(s.name)));
}

function cleanStaffName(value: string): string {
  return value
    .replace(/\([^()]*\)/g, "")
    .replace(/\[[^[\]]*\]/g, "")
    .replace(/sf\b/gi, "")
    .replace(/목사님|전도사님|선생님|간사님/g, "")
    .replace(/^[\d\s:：.\-•*]+/, "")
    .replace(/[^가-힣a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function usableStaffName(name: string): boolean {
  const key = searchText(name);
  if (key.length < 2 || key.length > 12) return false;
  if (/^\d+$/.test(key)) return false;
  if (/^(스탭명단|스탭|담당|기타|총|외부|선탑|선탑대|동승|후발|후발대|불가|파란색|학생외|연락|저녁|아침|점심|토|금|일|교회|수련회장|호차|버스|출발|도착|복귀|퇴소|핸드폰|휴대폰|핸드폰수거|휴대폰수거|진행|총괄|환경미화|멀미약|미디어|방송|음향|안내|강당안내|강당앞|배식구|퇴식구|식당내부|식당외부|주차장|층장|엘베앞|계단앞|문단속|등록부스)$/.test(key)) return false;
  return true;
}

function extractStaffNamesFromRosterLine(line: string): string[] {
  const withoutNotes = line
    .replace(/\([^()]*\)/g, "")
    .replace(/\[[^[\]]*\]/g, "")
    .replace(/^.*?스탭\s*명단\s*/i, "")
    .replace(/^\s*(?:\d{1,3}|외부)\s*[:：](?!\d)/, "")
    .replace(/총\s*\d+\s*명.*$/g, "")
    .replace(/\b[A-Za-z]+\b/g, match => /sf/i.test(match) ? "" : match);
  const matches = withoutNotes.match(/[가-힣]{2,4}\s*(?:sf)?/gi) ?? [];
  return matches
    .map(cleanStaffName)
    .filter(usableStaffName);
}

function extractStaffNamesWithSf(line: string): string[] {
  const matches = line.match(/[가-힣]{2,4}\s*sf\b/gi) ?? [];
  return matches
    .map(cleanStaffName)
    .filter(usableStaffName);
}

function extractStaffNamesFromCoordinatorLine(line: string): string[] {
  if (!/^\s*담당\s*[:：]/.test(line)) return [];
  const rest = line.replace(/^\s*담당\s*[:：]/, "");
  return rest
    .split(/[,，、/|\xB7]/)
    .map(cleanStaffName)
    .filter(usableStaffName);
}

function extractLooseStaffNames(line: string): string[] {
  const cleaned = line
    .replace(/\([^()]*\)/g, " ")
    .replace(/\[[^[\]]*\]/g, " ")
    .replace(/(?:\d{1,2}:)?\d{1,2}\s*호\s*차/g, " ")
    .replace(/[0-9:~\-]/g, " ");
  const matches = cleaned.match(/[가-힣]{2,4}\s*(?:sf)?/gi) ?? [];
  return matches.map(cleanStaffName).filter(usableStaffName);
}

function extractBusStaffDraftsFromRows(rows: string[][]): { drafts: AutoBusDraft[]; warnings: string[] } {
  const byKey = new Map<string, AutoBusDraft>();
  const warnings: string[] = [];
  let currentDay: 1 | 3 = 1;

  rows.forEach(row => {
    const lines = row.join("\n").split(/\n+/).map(line => line.trim()).filter(Boolean);
    lines.forEach(line => {
      const maybeDay = parseDayCell(line);
      if (maybeDay === 1 || maybeDay === 3) currentDay = maybeDay;
      if (maybeDay === 2) currentDay = 1;

      const compact = line.replace(/\s+/g, "");
      const busMatch = compact.match(/(\d{1,2})호차/);
      if (!busMatch) return;
      if (/조편성|배정표|학생|교사|좌석/.test(compact) && !/선탑|동승|스탭|sf/i.test(line)) return;

      const busNo = Number(busMatch[1]);
      if (!busNo) return;
      const afterBus = line.slice(line.search(/\d{1,2}\s*호\s*차/) + (line.match(/\d{1,2}\s*호\s*차/)?.[0].length ?? 0));
      const source = afterBus.includes(":") || afterBus.includes("：")
        ? afterBus.split(/[:：]/).slice(1).join(":")
        : afterBus;
      const parsed = parseBusStaff(source);
      const names = parsed.names.length ? parsed.names : Array.from(new Set([
        ...extractStaffNamesWithSf(source),
        ...extractLooseStaffNames(source),
      ])).filter(name => parseBusStaff(name).names.length > 0);
      if (!names.length) return;
      const day: 1 | 3 = /퇴소|귀가|복귀|3일차|셋째/.test(compact) ? 3 : currentDay === 3 ? 3 : 1;
      if (parsed.rejected.length > 0) {
        warnings.push(`${day}일차 ${busNo}호차 선탑/동승에서 이름 아닌 조각 제외: ${parsed.rejected.slice(0, 6).join(", ")}${parsed.rejected.length > 6 ? "…" : ""}`);
      }
      const key = `${day}-${busNo}`;
      const existing = byKey.get(key);
      const merged = Array.from(new Set([...(existing?.staff.split(",").map(s => s.trim()).filter(Boolean) ?? []), ...names])).join(", ");
      byKey.set(key, { day, busNo, staff: merged });
    });
  });

  return { drafts: [...byKey.values()].sort((a, b) => a.day - b.day || a.busNo - b.busNo), warnings };
}

function extractStaffDraftsFromRows(rows: string[][]): AutoStaffDraft[] {
  const drafts: AutoStaffDraft[] = [];
  const seen = new Set<string>();
  let inRoster = false;

  function add(name: string) {
    const key = searchText(name);
    if (seen.has(key)) return;
    seen.add(key);
    drafts.push({ name });
  }

  rows.forEach(row => {
    const lines = row.join("\n").split(/\n+/).map(line => line.trim()).filter(Boolean);
    lines.forEach(line => {
      const compact = line.replace(/\s+/g, "");
      extractStaffNamesFromCoordinatorLine(line).forEach(add);
      extractStaffNamesWithSf(line).forEach(add);
      if (/스탭명단/.test(compact)) inRoster = true;
      if (!inRoster) return;
      if (/^(?:총\s*\d+명|[*•]\s*(?:선탑|후발|일끝|파란색|학생외)|선탑대|후발대)/.test(line)) {
        if (!/^\s*(?:\d{1,3}|외부)\s*[:：](?!\d)/.test(line)) return;
      }
      if (!/스탭명단/.test(compact) && !/^\s*(?:\d{1,3}|외부)\s*[:：](?!\d)/.test(line)) return;
      extractStaffNamesFromRosterLine(line).forEach(add);
    });
  });

  return drafts;
}

export function parseCueSheetText(raw: string, staff: IguardStaff[] = []): ParsedCueSheet {
  const rows = parseDelimitedRows(raw);
  const warnings: string[] = [];
  const emptyStats = { detailCount: 0, ownerCount: 0, noticeCount: 0 };
  if (rows.length === 0) return { blocks: [], staffDrafts: [], busDrafts: [], importStats: emptyStats, warnings: ["붙여넣은 내용이 비어있습니다."], dayCounts: {} };
  const staffDrafts = extractStaffDraftsFromRows(rows);
  const busDraftResult = extractBusStaffDraftsFromRows(rows);
  const busDrafts = busDraftResult.drafts;
  warnings.push(...busDraftResult.warnings);

  const headerRowIndex = rows.findIndex(isRepeatedHeader);
  if (headerRowIndex < 0) {
    return { blocks: [], staffDrafts, busDrafts, importStats: emptyStats, warnings: ["구분/시간/내용 헤더를 찾지 못했습니다. 시트의 큐싯 표 범위를 복사해 붙여넣어주세요."], dayCounts: {} };
  }

  const headers = rows[headerRowIndex];
  const categoryIdx = headerIndex(headers, ["구분"]);
  const timeIdx = headerIndex(headers, ["시간"]);
  const detailIdx = headerIndex(headers, ["내용"]);
  const ownerIdx = headerIndex(headers, ["담당"]);
  const noticeIdx = headerIndex(headers, ["기타", "유의사항", "특이사항", "주의사항"]);
  const dataRows: string[][] = [];
  rows.slice(headerRowIndex + 1).forEach(row => {
    const whole = row.join(" ").trim();
    const hasTime = parseTimeRange(row[timeIdx] ?? "");
    const isDayMarker = parseDayCell(whole) != null;
    if (isRepeatedHeader(row)) return;
    if (hasTime || isDayMarker || dataRows.length === 0) {
      dataRows.push(row);
      return;
    }
    const target = dataRows[dataRows.length - 1];
    const appendIdx = rowHasStaffText(whole, staff) && ownerIdx >= 0
      ? ownerIdx
      : /선탑|스탭명단|유의|주의|특이|총\s*\d+명/.test(whole) && noticeIdx >= 0
        ? noticeIdx
        : detailIdx >= 0 ? detailIdx : Math.max(0, target.length - 1);
    target[appendIdx] = [target[appendIdx], whole].filter(Boolean).join("\n");
  });
  let day = 1;
  const blocks: ImportedBlock[] = [];
  const overnightNotes: string[] = [];

  dataRows.forEach((row, index) => {
    const whole = row.join(" ").trim();
    const timeCell = row[timeIdx] ?? "";
    const range = parseTimeRange(timeCell);
    // 시간이 있는 행은 일정 블록 — "첫째날/둘째날" 같은 단어가 제목·내용에 섞여 있어도
    // 날짜 구분행으로 삼키면 안 된다 (기도회·둘째날 오전 프로그램 행이 통째로 사라졌던 버그).
    const maybeDay = range ? null : parseDayCell(whole);
    if (maybeDay != null) {
      day = maybeDay;
      return;
    }
    if (!range) {
      if (whole && !/담당|구분|시간|내용/.test(whole)) warnings.push(`${index + headerRowIndex + 2}행: 시간을 찾지 못해 건너뜀`);
      return;
    }
    const label = compactText(row[categoryIdx] || "").replace(/\n+/g, " ") || "일정";
    const detail = compactText(row[detailIdx] || "");
    const owner = ownerIdx >= 0 ? compactText(row[ownerIdx] || "") : "";
    const notice = noticeIdx >= 0 ? compactText(row[noticeIdx] || "") : "";
    // 자정 넘김·새벽 일정을 전날 24시+ 표기로 정규화 (아래 resolveOvernight 주석 참조)
    const resolved = resolveOvernight(day, range.start, range.end);
    if (resolved.converted) {
      overnightNotes.push(`${day}일차 ${timeRangeLabel(range.start, range.end)} → ${resolved.day}일차 ${timeRangeLabel(resolved.start, resolved.end)}`);
    }
    blocks.push({
      day: resolved.day,
      start: resolved.start,
      end: resolved.end,
      label,
      meal: looksLikeMeal(label, detail) || undefined,
      detail: detail || undefined,
      owner: owner || undefined,
      notice: notice || undefined,
    });
  });

  if (overnightNotes.length) {
    warnings.push(`자정 넘김/새벽 ${overnightNotes.length}개를 전날 24시+ 표기로 정리: ${overnightNotes.slice(0, 4).join(" · ")}${overnightNotes.length > 4 ? " …" : ""}`);
  }
  if (!blocks.length) warnings.push("가져올 수 있는 시간 블록이 없습니다. 시간 칸이 08:30~09:00 형태인지 확인해주세요.");
  const dayCounts = blocks.reduce<Record<number, number>>((acc, block) => {
    acc[block.day] = (acc[block.day] || 0) + 1;
    return acc;
  }, {});
  const importStats = {
    detailCount: blocks.filter(block => !!block.detail).length,
    ownerCount: blocks.filter(block => !!block.owner).length,
    noticeCount: blocks.filter(block => !!block.notice).length,
  };
  return { blocks, staffDrafts, busDrafts, importStats, warnings, dayCounts };
}

function cleanRole(value: string): string {
  let text = value;
  while (/\([^()]*\)/.test(text)) text = text.replace(/\([^()]*\)/g, "");
  while (/\[[^[\]]*\]/.test(text)) text = text.replace(/\[[^[\]]*\]/g, "");
  return text
    .replace(/^[*\-•\s]+/, "")
    .replace(/[)\]]/g, "")
    .trim();
}

function roleFromLine(line: string): string {
  const beforeColon = line.split(/[:：]/)[0] || "";
  return cleanRole(beforeColon);
}

function roundFromLine(line: string): "선밥" | "후밥" | undefined {
  if (line.includes("선밥")) return "선밥";
  if (line.includes("후밥")) return "후밥";
  return undefined;
}

export function venueForBlock(block: ImportedBlock, blocks: ImportedBlock[]): "교회" | "수련회장" {
  if (block.day !== 1) return "수련회장";
  const blockText = `${block.label} ${block.detail || ""} ${block.owner || ""}`;
  if (/등록/.test(blockText)) return "교회";
  const departureStarts = blocks
    .filter(b => b.day === 1 && /출발/.test(`${b.label} ${b.detail || ""}`))
    .map(b => toMinutes(b.start))
    .filter(Number.isFinite);
  const departureStart = departureStarts.length ? Math.min(...departureStarts) : 10 * 60;
  return toMinutes(block.start) < departureStart ? "교회" : "수련회장";
}

function postIdentity(area: string | undefined, name: string): string {
  return `${searchText(area || "")}__${searchText(name)}`;
}

function matchPost(role: string, line: string, posts: IguardPost[], preferredArea?: string): IguardPost | null {
  const roleKey = searchText(role);
  const lineKey = searchText(line);
  const preferredAreaKey = searchText(preferredArea || "");
  const scored = posts
    .map(post => {
      const postKey = searchText(post.name);
      const areaKey = searchText(post.area || "");
      let score = 0;
      if (postKey && roleKey === postKey) score += 100;
      if (postKey && roleKey.includes(postKey)) score += 70;
      if (postKey && postKey.includes(roleKey)) score += 55;
      if (postKey && lineKey.includes(postKey)) score += 35;
      if (preferredAreaKey && areaKey === preferredAreaKey) score += 45;
      if (areaKey && roleKey.includes(areaKey)) score += 15;
      return { post, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.post ?? null;
}

function staffMentions(line: string, staff: IguardStaff[]): IguardStaff[] {
  const key = searchText(line);
  return staff.filter(s => {
    const staffKey = searchText(s.name);
    return staffKey.length >= 2 && key.includes(staffKey);
  });
}

function isSectionLine(line: string, staff: IguardStaff[]): boolean {
  return /^[*•]/.test(line.trim()) && !/[:：]/.test(line) && staffMentions(line, staff).length === 0;
}

function usableAutoPostName(name: string): boolean {
  const key = searchText(name);
  if (key.length < 2 || key.length > 40) return false;
  if (/^\d+$/.test(key)) return false;
  if (/^(담당|기타|내용|시간|구분|스탭명단|선탑인원|선탑|외부|총|후발|선발대)$/.test(key)) return false;
  if (/호차$/.test(key)) return false;
  return true;
}

export function collectAutoPostDrafts(blocks: ImportedBlock[], staff: IguardStaff[], posts: IguardPost[]): AutoPostDraft[] {
  const drafts: AutoPostDraft[] = [];
  const known = new Set(posts.map(post => postIdentity(post.area, post.name)));
  const drafted = new Set<string>();

  blocks.forEach(block => {
    const area = venueForBlock(block, blocks);
    const lines = `${block.owner || ""}`
      .split(/\n+/)
      .map(line => line.trim())
      .filter(Boolean);

    lines.forEach(line => {
      if (isSectionLine(line, staff)) return;
      if (!/[:：]/.test(line) || staffMentions(line, staff).length === 0) return;
      const name = roleFromLine(line);
      const key = postIdentity(area, name);
      if (!usableAutoPostName(name) || known.has(key) || drafted.has(key)) return;
      drafted.add(key);
      drafts.push({
        name,
        area,
      });
    });
  });

  return drafts;
}

export function postsWithAutoDrafts(blocks: ImportedBlock[], staff: IguardStaff[], posts: IguardPost[]): { posts: IguardPost[]; drafts: AutoPostDraft[] } {
  const drafts = collectAutoPostDrafts(blocks, staff, posts);
  const virtualPosts = drafts.map((draft, index) => ({
    id: `__auto_post_${index}`,
    ...draft,
  }));
  return { posts: [...posts, ...virtualPosts], drafts };
}

export function staffWithAutoDrafts(staff: IguardStaff[], staffDrafts: AutoStaffDraft[]): { staff: IguardStaff[]; drafts: AutoStaffDraft[] } {
  const known = new Set(staff.map(s => searchText(s.name)).filter(Boolean));
  const drafts: AutoStaffDraft[] = [];
  const drafted = new Set<string>();
  staffDrafts.forEach(draft => {
    const key = searchText(draft.name);
    if (!key || known.has(key) || drafted.has(key)) return;
    drafted.add(key);
    drafts.push(draft);
  });
  const virtualStaff = drafts.map((draft, index) => ({
    id: `__auto_staff_${index}`,
    order: staff.length + index,
    ...draft,
  }));
  return { staff: [...staff, ...virtualStaff], drafts };
}

export function autoAssignmentsForBlock(block: ImportedBlock, staff: IguardStaff[], posts: IguardPost[], preferredArea?: string): AutoAssignment[] {
  if (!staff.length || !posts.length) return [];
  const lines = `${block.owner || ""}`
    .split(/\n+/)
    .map(line => line.trim())
    .filter(line => line && !/^(\d{1,2}|외부|총)\s*[:：]/.test(line));
  const assignments: AutoAssignment[] = [];
  const used = new Set<string>();
  let currentRole = "";

  lines.forEach(line => {
    const explicitRole = /[:：]/.test(line) ? roleFromLine(line) : "";
    if (explicitRole) currentRole = explicitRole;
    const role = explicitRole || currentRole || block.label;
    const post = matchPost(role, line, posts, preferredArea);
    const matchedStaff = staffMentions(line, staff);
    if (!post || matchedStaff.length === 0) return;
    matchedStaff.forEach(s => {
      if (used.has(s.id)) return;
      used.add(s.id);
      assignments.push({
        staffId: s.id,
        postId: post.id,
        round: roundFromLine(line),
        note: cleanRole(line).slice(0, 120) || role,
      });
    });
  });

  return assignments;
}
