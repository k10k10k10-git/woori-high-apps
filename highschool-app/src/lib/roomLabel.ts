// 방 표시 라벨 — 동(건물)이 있으면 "동 호수", 없으면 호수만.
// 숙소 건물이 여러 개인 수련회장을 위해 동을 추가했고, 기존(단일 건물) 방은 dong이 없어 호수만 나온다.
export function roomLabel(room: { dong?: string | null; roomNumber: string }): string {
  const dong = (room.dong ?? "").trim();
  return dong ? `${dong} ${room.roomNumber}` : room.roomNumber;
}

/**
 * 호수에서 층 라벨 추출 — 도면형 인쇄에서 층 행(row)을 나누는 기준.
 *   "101"→"1층", "1204"→"12층". 앞자리가 숫자 3자리 미만이거나 숫자가 아니면 ""(층 구분 없음).
 *   (호텔식 표기: 끝 두 자리 = 호수, 나머지 앞자리 = 층)
 */
export function roomFloor(roomNumber: string): string {
  const m = roomNumber.trim().match(/^(\d+)/);
  if (!m || m[1].length < 3) return "";
  return `${parseInt(m[1].slice(0, m[1].length - 2))}층`;
}

/**
 * 방 목록 정렬 — ① 동(건물)별로 묶고 ② 각 동 안에서 호수를 숫자순으로.
 *   예) 101,102,…,110,201  (문자열 정렬의 "110<99" 문제를 numeric 옵션으로 방지)
 * 동이 없는(단일 건물) 방은 앞쪽에 모인다. 저장 순서는 그대로 두고 표시용으로만 정렬한다.
 */
export function sortRooms<T extends { dong?: string | null; roomNumber: string }>(rooms: T[]): T[] {
  return [...rooms].sort((a, b) => {
    const ad = (a.dong ?? "").trim(), bd = (b.dong ?? "").trim();
    if (ad !== bd) return ad.localeCompare(bd, "ko", { numeric: true });
    return a.roomNumber.localeCompare(b.roomNumber, "ko", { numeric: true });
  });
}
