import { ref, get, set, update, push, remove, onValue, query, orderByChild, equalTo, runTransaction, DataSnapshot } from "firebase/database";
import { db } from "../firebase";
import { Cancellation, UnmatchedPayment, MedicalLog } from "../types";
import { paths } from "../paths";
import { snapToList, stripUndefined } from "./core";

// ── Cancellations ─────────────────────────────────────────
// 🔒 민감(환불계좌 등) — retreatsPrivate/{id}/cancellations 에 저장.
//    이가드 멤버가 retreats/{id} 전체를 읽으므로, 민감 노드는 형제 트리로 분리한다.

export async function getCancellations(retreatId: string): Promise<Cancellation[]> {
  const snap = await get(ref(db, paths.cancellations(retreatId)));
  return snapToList<Cancellation>(snap);
}

export async function saveCancellation(retreatId: string, data: Omit<Cancellation, "id">): Promise<string> {
  const newRef = push(ref(db, paths.cancellations(retreatId)));
  await set(newRef, stripUndefined(data));
  return newRef.key!;
}

export async function updateCancellation(retreatId: string, cId: string, data: Partial<Cancellation>): Promise<void> {
  await update(ref(db, paths.cancellation(retreatId, cId)), stripUndefined(data));
}

export async function deleteCancellation(retreatId: string, cId: string): Promise<void> {
  await remove(ref(db, paths.cancellation(retreatId, cId)));
}

export async function getCancellationByStudentKey(retreatId: string, studentKey: string): Promise<Cancellation | null> {
  const q = query(
    ref(db, paths.cancellations(retreatId)),
    orderByChild("studentKey"),
    equalTo(studentKey),
  );
  const snap = await get(q);
  if (!snap.exists()) return null;
  const [id, data] = Object.entries(snap.val())[0];
  return { id, ...(data as object) } as Cancellation;
}

// ── 입금 미매칭 ──────────────────────────────────────────────

export function subscribeToUnmatchedPayments(
  retreatId: string,
  cb: (list: UnmatchedPayment[]) => void,
  onError?: (error: Error) => void
) {
  const r = ref(db, paths.unmatchedPayments(retreatId));
  return onValue(r, snap => {
    cb(snapToList<UnmatchedPayment>(snap).sort((a, b) => b.createdAt - a.createdAt));
  }, (error) => { console.warn("subscribeToUnmatchedPayments error:", error); onError?.(error); });
}

export async function addUnmatchedPayment(
  retreatId: string,
  data: Omit<UnmatchedPayment, "id">
): Promise<string> {
  const newRef = push(ref(db, paths.unmatchedPayments(retreatId)));
  await set(newRef, stripUndefined(data));
  return newRef.key!;
}

export async function resolveUnmatchedPayment(
  retreatId: string,
  paymentId: string,
  fields: Partial<UnmatchedPayment>,
  paidCellKey?: string
): Promise<void> {
  const resolved = stripUndefined({
    ...fields,
    resolvedAt: new Date().toISOString(),
  });

  if (paidCellKey) {
    // unmatchedPayments(민감)는 retreatsPrivate, cellColors는 retreats — 루트 멀티패스로 동시 갱신
    const payload: Record<string, unknown> = {};
    Object.entries(resolved).forEach(([key, value]) => {
      payload[`${paths.unmatchedPayment(retreatId, paymentId)}/${key}`] = value;
    });
    payload[paths.cellColor(retreatId, paidCellKey)] = "blue";
    await update(ref(db), payload);
    return;
  }

  await update(ref(db, paths.unmatchedPayment(retreatId, paymentId)), resolved);
}

export async function unresolveUnmatchedPayment(
  retreatId: string,
  paymentId: string,
  paidCellKey?: string
): Promise<void> {
  const fields = {
    resolvedStudentKey: null,
    resolvedStudentName: null,
    resolvedStudentGrade: null,
    resolvedStudentClass: null,
    resolvedStudentId: null,
    resolvedAt: null,
  };

  if (paidCellKey) {
    // 연결 시 markPaid로 cellColors를 "blue"로 세팅했다면, 해제 시 그 표시도 함께 지운다.
    // (unmatchedPayments는 retreatsPrivate, cellColors는 retreats — 루트 멀티패스로 동시 갱신)
    const payload: Record<string, unknown> = {};
    Object.entries(fields).forEach(([key, value]) => {
      payload[`${paths.unmatchedPayment(retreatId, paymentId)}/${key}`] = value;
    });
    payload[paths.cellColor(retreatId, paidCellKey)] = null;
    await update(ref(db), payload);
    return;
  }

  await update(ref(db, paths.unmatchedPayment(retreatId, paymentId)), fields);
}

export async function deleteUnmatchedPayment(
  retreatId: string,
  paymentId: string
): Promise<void> {
  await remove(ref(db, paths.unmatchedPayment(retreatId, paymentId)));
}

export async function updateUnmatchedPayment(
  retreatId: string,
  paymentId: string,
  fields: Partial<Pick<UnmatchedPayment, "payerName" | "note">>
): Promise<void> {
  await update(ref(db, paths.unmatchedPayment(retreatId, paymentId)), stripUndefined(fields));
}

// ── MedicalLog ────────────────────────────────────────────

export function subscribeToMedicalLogs(retreatId: string, callback: (logs: MedicalLog[]) => void, onError?: (error: Error) => void): () => void {
  const r = ref(db, paths.medicalLogs(retreatId));
  return onValue(r, (snap) => callback(snapToList<MedicalLog>(snap).sort((a, b) => b.createdAt - a.createdAt)),
    (error) => { console.warn("subscribeToMedicalLogs error:", error); onError?.(error); });
}

export async function saveMedicalLog(retreatId: string, data: Omit<MedicalLog, "id">): Promise<string> {
  const newRef = push(ref(db, paths.medicalLogs(retreatId)));
  await set(newRef, stripUndefined(data));
  return newRef.key!;
}

export async function updateMedicalLog(retreatId: string, id: string, data: Partial<Omit<MedicalLog, "id">>): Promise<void> {
  await update(ref(db, paths.medicalLog(retreatId, id)), stripUndefined(data));
}

export async function deleteMedicalLog(retreatId: string, id: string): Promise<void> {
  await remove(ref(db, paths.medicalLog(retreatId, id)));
}
