// 버스 인승 — 과거 데이터에는 capacity 필드가 없으므로(45인승 고정 시절) 기본값으로 흡수한다.
export const DEFAULT_BUS_CAPACITY = 45;
export const MIN_BUS_CAPACITY = 4;   // 스탭 예약석(3) + 최소 1석
export const MAX_BUS_CAPACITY = 99;

/** 버스의 실효 인승 — capacity가 없거나 비정상이면 기본 45인승으로 간주 (하위호환) */
export function busCapacityOf(bus?: { capacity?: number } | null): number {
  const c = bus?.capacity;
  return typeof c === "number" && Number.isFinite(c) && c >= MIN_BUS_CAPACITY && c <= MAX_BUS_CAPACITY
    ? Math.floor(c)
    : DEFAULT_BUS_CAPACITY;
}

/** 인승 입력값 검증 — 모달 저장 전 확인용 */
export function isValidBusCapacity(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_BUS_CAPACITY && value <= MAX_BUS_CAPACITY;
}
