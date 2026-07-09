// 방 표시 라벨 — 동(건물)이 있으면 "동 호수", 없으면 호수만.
// 숙소 건물이 여러 개인 수련회장을 위해 동을 추가했고, 기존(단일 건물) 방은 dong이 없어 호수만 나온다.
export function roomLabel(room: { dong?: string | null; roomNumber: string }): string {
  const dong = (room.dong ?? "").trim();
  return dong ? `${dong} ${room.roomNumber}` : room.roomNumber;
}
