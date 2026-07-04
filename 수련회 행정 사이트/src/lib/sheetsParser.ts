import { Participant } from "./types";

// ── Google Sheets URL 파싱 ─────────────────────────────────

/**
 * Google Sheets URL에서 sheetId와 gid를 추출합니다.
 *
 * 지원 형식:
 *   https://docs.google.com/spreadsheets/d/{sheetId}/edit#gid={gid}
 *   https://docs.google.com/spreadsheets/d/{sheetId}/edit?gid={gid}
 *   https://docs.google.com/spreadsheets/d/{sheetId}/edit?usp=sharing (gid 없음)
 *
 * @returns 파싱 성공 시 { sheetId, sheetGid }, 실패 시 null
 */
export function parseSheetUrl(url: string): { sheetId: string; sheetGid: string } | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  // sheetId: /spreadsheets/d/{id}/ 형식
  const idMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!idMatch) return null;

  const sheetId = idMatch[1];

  // gid: #gid=, ?gid=, &gid= 모두 처리
  const gidMatch = trimmed.match(/[#?&]gid=(\d+)/);
  const sheetGid = gidMatch ? gidMatch[1] : "";

  return { sheetId, sheetGid };
}

/**
 * sheetId + gid → 구글 시트 URL 복원
 */
export function buildSheetUrl(sheetId: string, sheetGid: string): string {
  if (!sheetId) return "";
  const base = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
  return sheetGid ? `${base}#gid=${sheetGid}` : base;
}

// ── Google Sheets CSV 파싱 ────────────────────────────────

/**
 * Google Sheets CSV를 파싱하여 참가자 목록 반환
 * 시트는 "웹에 게시" 필요 (File > Share > Publish to web > CSV)
 * 내부적으로 fetchSheetCSV를 호출해 URL 구성 중복을 제거
 */
export async function fetchSheetParticipants(
  sheetId: string,
  gid: string
): Promise<Participant[]> {
  const rows = await fetchSheetCSV(sheetId, gid);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.trim());
  const participants: Participant[] = [];

  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    if (!values[1]?.trim()) continue; // 이름 없으면 skip

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx]?.trim() || "";
    });

    const participant = extractParticipant(row, headers, values);
    // raw: 시트의 모든 열 원본 — 주민등록번호 등 고정 필드로 못 뽑아낸 값도 중복신청 검토 시 볼 수 있게.
    // ⚠ 참가자 저장(saveParticipants) 시에는 반드시 제외해야 한다 — 그쪽은 이가드도 읽는 공용 경로.
    if (participant) participants.push({ ...participant, raw: row });
  }

  return participants;
}

function extractParticipant(
  row: Record<string, string>,
  headers: string[],
  values: string[]
): Participant | null {
  // 타임스탬프(A), 이름(B), 성별(C), 몇부(D) 는 고정
  const registeredAt = values[0]?.trim() || "";
  const name = values[1]?.trim() || "";
  const gender = values[2]?.trim() || "";
  const bu = values[3]?.trim() || "";

  if (!name) return null;

  // 학년/반 찾기: 여러 컬럼에 분산되어 있음 (폼 분기)
  let grade = 0;
  let classNum = 0;

  for (let i = 4; i < headers.length; i++) {
    const h = headers[i];
    const v = values[i]?.trim() || "";
    if (!v) continue;

    if (h.includes("학년") && !h.includes("반")) {
      // "몇 학년 인가요?" 컬럼
      const match = v.match(/(\d+)학년/);
      if (match) grade = parseInt(match[1]);
    } else if (h.includes("반") || v.match(/^\d+반/)) {
      // "몇 반 인가요?" 컬럼 - 값이 "1반 (김선생T)" 형식일 수 있음
      const match = v.match(/(\d+)반/);
      if (match) classNum = parseInt(match[1]);
    }
  }

  // 연락처 찾기: "연락" "전화" "번호" "핸드폰" "휴대" 포함 헤더
  let phone: string | undefined;
  for (let i = 4; i < headers.length; i++) {
    const h = headers[i];
    const v = values[i]?.trim() || "";
    if ((h.includes("연락") || h.includes("전화") || h.includes("번호") || h.includes("핸드폰") || h.includes("휴대")) && v) {
      phone = v;
      break;
    }
  }

  // 기타사항 찾기: "기타" 또는 "특이" 포함 헤더
  let extra: string | undefined;
  for (let i = 4; i < headers.length; i++) {
    const h = headers[i];
    const v = values[i]?.trim() || "";
    if ((h.includes("기타") || h.includes("특이")) && v) {
      extra = v;
      break;
    }
  }

  return {
    name,
    gender,
    grade,
    class: classNum,
    bu,
    registeredAt,
    ...(phone ? { phone } : {}),
    ...(extra ? { extra } : {}),
  };
}

/**
 * Google Sheets CSV를 raw 2D 배열로 반환 (헤더 포함)
 * InsuranceTab, TshirtTab 등 커스텀 파싱이 필요한 곳에서 공유
 */
export async function fetchSheetCSV(sheetId: string, gid: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}&t=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("시트를 불러올 수 없습니다. '웹에 게시' 설정을 확인해주세요.");
  const text = await res.text();
  return parseCSV(text);
}

/**
 * CSV 전체 텍스트 파싱 — 따옴표 안의 줄바꿈/쉼표를 올바르게 처리
 * (단순 split("\n")은 응답 셀에 줄바꿈이 있으면 행이 깨짐)
 */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      row.push(current);
      current = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && text[i + 1] === "\n") i++; // CRLF
      row.push(current);
      current = "";
      if (row.some(c => c.trim())) rows.push(row); // 빈 행 제외
      row = [];
    } else {
      current += ch;
    }
  }
  // 마지막 행 (개행 없이 끝나는 경우)
  row.push(current);
  if (row.some(c => c.trim())) rows.push(row);
  return rows;
}

export function parseCSVLine(line: string): string[] {
  return parseCSV(line)[0] ?? [""];
}
