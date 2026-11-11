import { ref, get, push, onValue } from "@/lib/rtdb";
import { auditedSet as set, auditedUpdate as update, auditedRemove as remove, auditedRunTransaction as runTransaction } from "@/features/activityLog/write";
import { db } from "../firebase";
import { CarPool, PartialAttendance, SupplyItem, SnackItem, AdminSupplyItem, SuppliesBudget, MealCountData, OnSiteEntry, TshirtOrder } from "../types";
import { paths } from "../paths";
import { isPartialAttendanceType } from "../partialAttendanceType";
import { snapToList, stripUndefined } from "./core";

// ── Carpool ───────────────────────────────────────────────

export async function getCarpools(retreatId: string): Promise<CarPool[]> {
  const snap = await get(ref(db, paths.carpools(retreatId)));
  return snapToList<CarPool>(snap);
}

export function subscribeToCarpools(retreatId: string, callback: (items: CarPool[]) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.carpools(retreatId)), (snap) => callback(snapToList<CarPool>(snap)), onError);
}

export async function saveCarpool(retreatId: string, carpool: Omit<CarPool, "id">): Promise<string> {
  const newRef = push(ref(db, paths.carpools(retreatId)));
  await set(newRef, stripUndefined(carpool));
  return newRef.key!;
}

export async function updateCarpool(retreatId: string, carpoolId: string, data: Partial<CarPool>): Promise<void> {
  await update(ref(db, paths.carpool(retreatId, carpoolId)), stripUndefined(data));
}

export async function deleteCarpool(retreatId: string, carpoolId: string): Promise<void> {
  await remove(ref(db, paths.carpool(retreatId, carpoolId)));
}

// ── Cell Colors ───────────────────────────────────────────

export function subscribeToCellColors(retreatId: string, callback: (colors: Record<string, string>) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.cellColors(retreatId)), (snap) => callback(snap.exists() ? snap.val() : {}),
    (error) => { console.warn("subscribeToCellColors error:", error); onError?.(error); });
}


export async function getCellColors(retreatId: string): Promise<Record<string, string>> {
  const snap = await get(ref(db, paths.cellColors(retreatId)));
  return snap.exists() ? snap.val() : {};
}

export async function setCellColor(retreatId: string, cellKey: string, color: string | null): Promise<void> {
  if (color === null) {
    await remove(ref(db, paths.cellColor(retreatId, cellKey)));
  } else {
    await set(ref(db, paths.cellColor(retreatId, cellKey)), color);
  }
}

// ── Partial Attendance ────────────────────────────────────

export async function getPartialAttendances(retreatId: string): Promise<PartialAttendance[]> {
  const snap = await get(ref(db, paths.partialAttendances(retreatId)));
  return snapToList<PartialAttendance>(snap)
    .filter(r => isPartialAttendanceType(r.type));
}

export function subscribeToPartialAttendances(retreatId: string, callback: (list: PartialAttendance[]) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.partialAttendances(retreatId)),
    (snap) => callback(snapToList<PartialAttendance>(snap).filter(r => isPartialAttendanceType(r.type))),
    (error) => { console.warn("subscribeToPartialAttendances error:", error); onError?.(error); });
}

export async function savePartialAttendance(retreatId: string, studentKey: string, data: Omit<PartialAttendance, "id">): Promise<string> {
  await set(ref(db, paths.partialAttendance(retreatId, studentKey)), stripUndefined({
    type: data.type,
    day: data.type === "당일참석" ? data.day : undefined, // 당일참석만 일차를 기록 (Rules: 1~3)
    note: data.note,
    updatedAt: data.updatedAt ?? Date.now(),
  }));
  return studentKey;
}

export async function updatePartialAttendance(retreatId: string, paId: string, data: Partial<PartialAttendance>): Promise<void> {
  await update(ref(db, paths.partialAttendance(retreatId, paId)), stripUndefined({
    type: data.type,
    note: data.note,
    updatedAt: data.updatedAt ?? Date.now(),
  }));
}

export async function deletePartialAttendance(retreatId: string, paId: string): Promise<void> {
  await remove(ref(db, paths.partialAttendance(retreatId, paId)));
}

export async function getPartialAttendanceByStudentKey(retreatId: string, studentKey: string): Promise<PartialAttendance | null> {
  const snap = await get(ref(db, paths.partialAttendance(retreatId, studentKey)));
  if (!snap.exists()) return null;
  const data = snap.val() as Omit<PartialAttendance, "id">;
  if (!isPartialAttendanceType(data.type)) return null;
  return { id: studentKey, ...data };
}

// ── Supplies ──────────────────────────────────────────────

export async function getSupplies(retreatId: string): Promise<SupplyItem[]> {
  const snap = await get(ref(db, paths.supplies(retreatId)));
  return snapToList<SupplyItem>(snap);
}

export function subscribeToSupplies(retreatId: string, callback: (items: SupplyItem[]) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.supplies(retreatId)), (snap) => callback(snapToList<SupplyItem>(snap)), onError);
}

export async function saveSupply(retreatId: string, data: Omit<SupplyItem, "id">): Promise<string> {
  const newRef = push(ref(db, paths.supplies(retreatId)));
  await set(newRef, stripUndefined(data));
  return newRef.key!;
}

export async function updateSupply(retreatId: string, sId: string, data: Partial<SupplyItem>): Promise<void> {
  await update(ref(db, paths.supply(retreatId, sId)), stripUndefined(data));
}

export async function deleteSupply(retreatId: string, sId: string): Promise<void> {
  await remove(ref(db, paths.supply(retreatId, sId)));
}

// ── Admin Supplies (행정물품 체크리스트) ────────────────────

export async function getAdminSupplies(retreatId: string): Promise<AdminSupplyItem[]> {
  const snap = await get(ref(db, paths.adminSupplies(retreatId)));
  return snapToList<AdminSupplyItem>(snap);
}

export function subscribeToAdminSupplies(retreatId: string, callback: (items: AdminSupplyItem[]) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.adminSupplies(retreatId)), (snap) => callback(snapToList<AdminSupplyItem>(snap)), onError);
}

export async function saveAdminSupply(retreatId: string, data: Omit<AdminSupplyItem, "id">): Promise<string> {
  const newRef = push(ref(db, paths.adminSupplies(retreatId)));
  await set(newRef, stripUndefined(data));
  return newRef.key!;
}

export async function updateAdminSupply(retreatId: string, sId: string, data: Partial<AdminSupplyItem>): Promise<void> {
  await update(ref(db, paths.adminSupply(retreatId, sId)), stripUndefined(data));
}

export async function deleteAdminSupply(retreatId: string, sId: string): Promise<void> {
  await remove(ref(db, paths.adminSupply(retreatId, sId)));
}

// ── Snacks ────────────────────────────────────────────────

export async function getSnacks(retreatId: string): Promise<SnackItem[]> {
  const snap = await get(ref(db, paths.snacks(retreatId)));
  return snapToList<SnackItem>(snap);
}

export function subscribeToSnacks(retreatId: string, callback: (items: SnackItem[]) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.snacks(retreatId)), (snap) => callback(snapToList<SnackItem>(snap)), onError);
}

export async function saveSnack(retreatId: string, data: Omit<SnackItem, "id">): Promise<string> {
  const newRef = push(ref(db, paths.snacks(retreatId)));
  await set(newRef, stripUndefined(data));
  return newRef.key!;
}

export async function updateSnack(retreatId: string, sId: string, data: Partial<SnackItem>): Promise<void> {
  await update(ref(db, paths.snack(retreatId, sId)), stripUndefined(data));
}

export async function deleteSnack(retreatId: string, sId: string): Promise<void> {
  await remove(ref(db, paths.snack(retreatId, sId)));
}

// ── Supplies Budget ───────────────────────────────────────

export async function getSuppliesBudget(retreatId: string): Promise<SuppliesBudget | null> {
  const snap = await get(ref(db, paths.suppliesBudget(retreatId)));
  if (!snap.exists()) return null;
  return snap.val() as SuppliesBudget;
}

export function subscribeToSuppliesBudget(retreatId: string, callback: (budget: SuppliesBudget | null) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.suppliesBudget(retreatId)), (snap) => callback(snap.exists() ? snap.val() as SuppliesBudget : null), onError);
}

export async function updateSuppliesBudget(retreatId: string, data: SuppliesBudget): Promise<void> {
  await set(ref(db, paths.suppliesBudget(retreatId)), data);
}

// ── Meal Count (식수 계산) ────────────────────────────────

export async function getMealCount(retreatId: string): Promise<MealCountData | null> {
  const snap = await get(ref(db, paths.mealCount(retreatId)));
  if (!snap.exists()) return null;
  return snap.val() as MealCountData;
}

export function subscribeToMealCount(retreatId: string, callback: (data: MealCountData | null) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.mealCount(retreatId)), (snap) => callback(snap.exists() ? snap.val() as MealCountData : null), onError);
}

export async function saveMealCount(retreatId: string, data: MealCountData): Promise<void> {
  await set(ref(db, paths.mealCount(retreatId)), stripUndefined({ ...data, updatedAt: Date.now() }));
}

// ── On-Site Registration ──────────────────────────────────

export function subscribeToOnSiteReg(
  retreatId: string,
  callback: (reg: Record<string, OnSiteEntry>) => void,
  onError?: (error: Error) => void
): () => void {
  const r = ref(db, paths.onSiteReg(retreatId));
  return onValue(r, (snap) => callback(snap.exists() ? snap.val() : {}),
    (error) => { console.warn("subscribeToOnSiteReg error:", error); onError?.(error); });
}

/** 기존 신청자 체크인 토글 (key = participant key, e.g. "p_0") */
export async function registerOnSite(retreatId: string, key: string, entry: OnSiteEntry): Promise<void> {
  await set(ref(db, paths.onSiteRegEntry(retreatId, key)), stripUndefined(entry));
}

export async function unregisterOnSite(retreatId: string, key: string): Promise<void> {
  await remove(ref(db, paths.onSiteRegEntry(retreatId, key)));
}

/**
 * 체크인 상태를 원자적으로 토글 (race condition 방지)
 * 여러 스태프가 거의 동시에 같은 학생을 누를 때 마지막 쓰기가 이전 쓰기를 덮어쓰는
 * lost-update를 막기 위해 Firebase 트랜잭션으로 "현재 서버 값 기준" 토글 처리.
 *
 * 반환값: 트랜잭션 적용 후 최종 등록 여부 (true = 등록됨, false = 해제됨)
 * isOnSite=true(현장추가)인 항목은 토글 대상이 아니므로 변경하지 않고 그대로 둠.
 */
export async function toggleOnSiteCheckIn(
  retreatId: string,
  key: string,
  buildEntry: () => OnSiteEntry
): Promise<boolean> {
  const r = ref(db, paths.onSiteRegEntry(retreatId, key));
  const result = await runTransaction(r, (current: OnSiteEntry | null) => {
    if (current && current.isOnSite) return current; // 현장추가 항목은 건드리지 않음
    if (current && !current.isOnSite) return null;   // 이미 등록됨 → 해제
    return buildEntry();                              // 미등록 → 등록
  });
  const finalVal = result.snapshot.val() as OnSiteEntry | null;
  return !!(finalVal && !finalVal.isOnSite);
}

/** 현장 추가 등록 (push key 자동 생성) */
export async function addWalkIn(retreatId: string, entry: Omit<OnSiteEntry, "isOnSite">): Promise<string> {
  const newRef = push(ref(db, paths.onSiteReg(retreatId)));
  await set(newRef, stripUndefined({ ...entry, isOnSite: true }));
  return newRef.key!;
}

// ── 단체티 신청 ────────────────────────────────────────────

export function subscribeToTshirtOrders(
  retreatId: string,
  cb: (orders: TshirtOrder[]) => void,
  onError?: (error: Error) => void
): () => void {
  const r = ref(db, paths.tshirtOrders(retreatId));
  return onValue(r, snap => {
    const orders = snapToList<TshirtOrder>(snap);
    orders.sort((a, b) =>
      a.bu.localeCompare(b.bu) ||
      a.grade - b.grade ||
      a.class - b.class ||
      a.name.localeCompare(b.name, "ko")
    );
    cb(orders);
  }, (error) => { console.warn("subscribeToTshirtOrders error:", error); onError?.(error); });
}

export async function addTshirtOrder(
  retreatId: string,
  data: Omit<TshirtOrder, "id">
): Promise<string> {
  const newRef = push(ref(db, paths.tshirtOrders(retreatId)));
  await set(newRef, stripUndefined(data));
  return newRef.key!;
}

export async function updateTshirtOrder(
  retreatId: string,
  orderId: string,
  data: Partial<Omit<TshirtOrder, "note">> & { note?: string | null }
): Promise<void> {
  await update(ref(db, paths.tshirtOrder(retreatId, orderId)), stripUndefined(data));
}

export async function deleteTshirtOrder(
  retreatId: string,
  orderId: string
): Promise<void> {
  await remove(ref(db, paths.tshirtOrder(retreatId, orderId)));
}

/** 시트에서 불러온 데이터로 sheet-source 항목만 교체, manual 항목은 유지
 *  단일 multi-path update로 원자적 처리 (중간 실패 시 데이터 유실 없음) */
export async function replaceSheetTshirtOrders(
  retreatId: string,
  orders: Omit<TshirtOrder, "id">[]
): Promise<void> {
  const basePath = paths.tshirtOrders(retreatId);
  const snap = await get(ref(db, basePath));

  // null = Firebase에서 해당 키 삭제, 신규 데이터 = 추가
  const payload: Record<string, Omit<TshirtOrder, "id"> | null> = {};

  // 기존 sheet-source 항목 삭제 마킹
  if (snap.exists()) {
    Object.entries(snap.val()).forEach(([id, data]) => {
      if ((data as TshirtOrder).source === "sheet") {
        payload[`${basePath}/${id}`] = null;
      }
    });
  }

  // 새 항목 추가 마킹 (push().key는 네트워크 없이 로컬에서 키 생성)
  orders.forEach(o => {
    const newKey = push(ref(db, basePath)).key!;
    payload[`${basePath}/${newKey}`] = stripUndefined(o);
  });

  // 한 번의 update()로 원자적 실행
  await update(ref(db), stripUndefined(payload));
}

// ── Medicine Presets ──────────────────────────────────────

const DEFAULT_MEDICINE_PRESETS = ["타이레놀", "이부프로펜", "소화제", "지사제", "밴드/연고", "멀미약", "두통약"];

export async function getMedicinePresets(retreatId: string): Promise<string[]> {
  const snap = await get(ref(db, paths.medicinePresets(retreatId)));
  if (!snap.exists()) return DEFAULT_MEDICINE_PRESETS;
  const val = snap.val();
  return Array.isArray(val) ? val : DEFAULT_MEDICINE_PRESETS;
}

export function subscribeToMedicinePresets(retreatId: string, callback: (items: string[]) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.medicinePresets(retreatId)), (snap) => {
    const value = snap.exists() ? snap.val() : null;
    callback(Array.isArray(value) ? value : DEFAULT_MEDICINE_PRESETS);
  }, onError);
}

export async function saveMedicinePresets(retreatId: string, items: string[]): Promise<void> {
  await set(ref(db, paths.medicinePresets(retreatId)), stripUndefined(items));
}
