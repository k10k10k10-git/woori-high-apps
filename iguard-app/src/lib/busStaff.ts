export interface BusStaffParseResult {
  names: string[];
  rejected: string[];
  suspicious: boolean;
}

const NON_NAME_WORDS = new Set([
  "부터", "간격으로", "이동", "시작", "순차", "순차적으", "순차적으로", "카톡방", "카톡방에",
  "인원", "인원보고", "보고", "하기", "통과", "후에", "선발대", "동선", "대기",
  "출발", "도착", "등록", "준비", "확인", "완료", "탑승", "하차",
  "안내", "문자", "공지", "명단", "호차", "버스", "좌석", "학생", "교사",
]);

function stripBusStaffLabel(value: string): string {
  return value
    .replace(/^선탑\/동승\s*[:：]?\s*/g, "")
    .replace(/^선탑\s*[:：]?\s*/g, "")
    .replace(/^동승\s*[:：]?\s*/g, "");
}

function cleanBusStaffToken(value: string): string {
  return stripBusStaffLabel(value)
    .replace(/\([^()]*\)/g, " ")
    .replace(/\[[^[\]]*\]/g, " ")
    .replace(/(?:^|\s)스탭\s*\d+\s*명(?=\s|$)/g, " ")
    .replace(/sf\b/gi, "")
    .replace(/목사님|전도사님|선생님|간사님/g, "")
    .replace(/^[\d\s:：.\-•*]+/, "")
    .replace(/[^가-힣a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function isNonNameToken(name: string): boolean {
  const words = name.split(/\s+/).filter(Boolean);
  const key = compact(name);
  if (!key) return true;
  if (key.length < 2 || key.length > 12) return true;
  if (/^\d+$/.test(key)) return true;
  if (/^스탭\d*명?$/.test(key)) return true;
  if (!/[가-힣]/.test(name)) return true;
  if (words.length > 3) return true;
  if (words.some(word => NON_NAME_WORDS.has(word))) return true;
  if (NON_NAME_WORDS.has(key)) return true;
  if (/합니다|하세요|해주세요|됩니다|됩니다|있습니다|없습니다|순서대로|순차적으로/.test(key)) return true;
  return false;
}

export function parseBusStaffNames(value?: string): string[] {
  return parseBusStaff(value).names;
}

export function parseBusStaff(value?: string): BusStaffParseResult {
  const tokens = stripBusStaffLabel(value || "")
    .split(/[,，、\n/]+/)
    .map(token => token.trim())
    .filter(Boolean);

  const names: string[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  const rejectedSeen = new Set<string>();

  tokens.forEach(token => {
    const cleaned = cleanBusStaffToken(token);
    const key = compact(cleaned);
    if (!cleaned || isNonNameToken(cleaned)) {
      const rejectedToken = cleaned || token;
      const rejectedKey = compact(rejectedToken);
      if (rejectedKey && !rejectedSeen.has(rejectedKey)) {
        rejectedSeen.add(rejectedKey);
        rejected.push(rejectedToken);
      }
      return;
    }
    if (!seen.has(key)) {
      seen.add(key);
      names.push(cleaned);
    }
  });

  return {
    names,
    rejected,
    suspicious: rejected.length > 0 || names.length > 8,
  };
}

export function mergeBusStaffNames(...sources: (string[] | undefined)[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  sources.flatMap(source => source || []).forEach(name => {
    const key = compact(name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    names.push(name);
  });
  return names;
}
