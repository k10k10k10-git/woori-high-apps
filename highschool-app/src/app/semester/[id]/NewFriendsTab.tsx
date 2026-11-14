"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import { useUI } from "@/context/UIContext";
import OverlayShell from "@/components/OverlayShell";
import {
  cancelNewFriendPlacement,
  registerNewFriendInRoster,
  removeNewFriend,
  removeNewFriendFromRoster,
  saveNewFriend,
} from "@/features/semester/db";
import { fetchClassOptions } from "@/features/semester/classOptions";
import {
  buildRegistrySubmission,
  canSendToRegistry,
  cancelNewFriendRegistry,
  defaultLedger,
  deriveRegistryProgress,
  fetchRegistryStates,
  fetchYearLedger,
  registryReadiness,
  skippedText,
  submitNewFriendToRegistry,
  type RegistryStage,
  type RegistryState,
  type YearLedger,
} from "@/features/semester/registryBridge";
import { useSemesterCanEdit } from "@/features/semester/EditContext";
import {
  deriveNewFriendRosterProgress,
  deriveNewFriendStage,
  formatClassLabel,
  formatKoreanPhone,
  formatNewFriendGrade,
  koreaDateInputValue,
  matchesNewFriendSearch,
  needsClassAssignment,
  NEW_FRIEND_FAITH_STEP_OPTIONS,
  NEW_FRIEND_INVITER_OPTIONS,
  newFriendRegisteredDate,
  newFriendAssignmentCopyText,
  validateNewFriendRosterRegistration,
} from "@/features/semester/newFriend";
import type {
  ClassInfo,
  NewFriend,
  NewFriendDecision,
  NewFriendPrivate,
} from "@/features/semester/types";

interface Props {
  sid: string;
  friends: NewFriend[];
  privateMap: Record<string, NewFriendPrivate>;
  canSyncRoster: boolean;
  /** 우리틴즈 원장 해(2027~)의 "교적에 접수" 권한 — 통합관리자·행정팀·교역자(accessPolicy.canSubmitNewFriendToRegistry). */
  canSubmitRegistry?: boolean;
  getStorageSid?: (friend: NewFriend) => string;
  getPrivateValue?: (friend: NewFriend) => NewFriendPrivate | undefined;
  getRecordKey?: (friend: NewFriend) => string;
}

type Draft = {
  name: string;
  part: "1부" | "2부";
  gender: "" | "남" | "여";
  school: string;
  grade: string;
  owner: string;
  decision: NewFriendDecision;
  week1Date: string;
  week2Date: string;
  registeredDate: string;
  inviter: string;
  faithStep: string;
  assignedClassKey: string;
  birth: string;
  phone: string;
  parentPhone: string;
  address: string;
  churchFriend: string;
  teamMemo: string;
  familyNotes: string;
  pastoralNotes: string;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  part: "1부",
  gender: "",
  school: "",
  grade: "1",
  owner: "",
  decision: "미정",
  week1Date: "",
  week2Date: "",
  registeredDate: "",
  inviter: "",
  faithStep: "",
  assignedClassKey: "",
  birth: "",
  phone: "",
  parentPhone: "",
  address: "",
  churchFriend: "",
  teamMemo: "",
  familyNotes: "",
  pastoralNotes: "",
};

const PROGRESS_STYLE = {
  대기: "bg-slate-100 text-slate-600",
  처리중: "bg-amber-100 text-amber-800",
  완료: "bg-teal-100 text-teal-700",
};

function draftFor(friend: NewFriend | null, priv: NewFriendPrivate | undefined): Draft {
  if (!friend) return { ...EMPTY_DRAFT, registeredDate: koreaDateInputValue() };
  return {
    name: friend.name,
    part: friend.part,
    gender: friend.gender ?? "",
    school: friend.school ?? "",
    grade: String(friend.grade),
    owner: friend.owner ?? "",
    decision: friend.decision,
    week1Date: friend.week1Date ?? "",
    week2Date: friend.week2Date ?? "",
    registeredDate: newFriendRegisteredDate(friend),
    inviter: friend.inviter ?? "",
    faithStep: friend.faithStep ?? "",
    assignedClassKey: friend.assignedClassKey ?? "",
    birth: priv?.birth ?? "",
    phone: priv?.phone ?? "",
    parentPhone: priv?.parentPhone ?? "",
    address: priv?.address ?? "",
    churchFriend: priv?.churchFriend ?? "",
    teamMemo: priv?.teamMemo ?? "",
    familyNotes: priv?.familyNotes ?? "",
    pastoralNotes: priv?.pastoralNotes ?? "",
  };
}

function NewFriendEditor({
  sid,
  friend,
  priv,
  classes,
  canSyncRoster,
  registryStage,
  onClose,
}: {
  sid: string;
  friend: NewFriend | null;
  priv?: NewFriendPrivate;
  classes: ClassInfo[];
  canSyncRoster: boolean;
  /** 우리틴즈 원장 해의 교적 단계. 접수·등록된 새친구는 이 화면에서 지우거나 배정을 풀지 않는다. */
  registryStage?: RegistryStage;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { toast, uiConfirm } = useUI();
  const [draft, setDraft] = useState(() => draftFor(friend, priv));
  const [opened] = useState(() => friend ? { friend: structuredClone(friend), privateValue: structuredClone(priv ?? {}) } : undefined);
  const [saving, setSaving] = useState(false);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const rosterLocked = Boolean(friend?.rosterSync);
  const registryLocked = registryStage === "submitted" || registryStage === "registered";
  const registryLockText = registryStage === "registered"
    ? "교적에 등록된 새친구입니다. 학생 정보·반 변경과 삭제는 우리틴즈 교적에서 해 주세요."
    : "교적 접수 대기 중인 새친구입니다. 먼저 목록에서 교적 접수를 취소해 주세요.";
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const classOptions = useMemo(() => classes
    .filter((item) => item.classKey.startsWith(`${draft.part === "1부" ? "1" : "2"}-${draft.grade}-`))
    .sort((a, b) => a.classKey.localeCompare(b.classKey, "ko")), [classes, draft.part, draft.grade]);

  async function handleSave() {
    if (!draft.name.trim()) return toast("이름을 입력해 주세요.", "error");
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await saveNewFriend(sid, {
        ...(friend
          ? {
              id: friend.id,
              createdAt: friend.createdAt,
              createdBy: friend.createdBy,
            }
          : { createdAt: now, createdBy: user?.uid }),
        name: draft.name.trim(),
        part: draft.part,
        grade: Number(draft.grade),
        decision: draft.decision,
        gender: draft.gender || undefined,
        school: draft.school.trim() || undefined,
        owner: draft.owner.trim() || undefined,
        week1Date: draft.week1Date || undefined,
        week2Date: draft.week2Date || undefined,
        registeredDate: draft.registeredDate || undefined,
        inviter: draft.inviter.trim() || undefined,
        faithStep: draft.faithStep.trim() || undefined,
        assignedClassKey: draft.assignedClassKey || undefined,
        // 선물 전달일은 운영에서 제거했지만 기존 레코드를 수정할 때 과거 값은 보존한다.
        giftDate: friend?.giftDate,
        updatedAt: now,
      }, {
        birth: draft.birth,
        phone: draft.phone,
        parentPhone: draft.parentPhone,
        address: draft.address,
        churchFriend: draft.churchFriend,
        teamMemo: draft.teamMemo,
        familyNotes: draft.familyNotes,
        pastoralNotes: draft.pastoralNotes,
      }, opened);
      toast(friend ? "새친구 기록을 수정했습니다." : "새친구를 접수했습니다.", "success");
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : "저장에 실패했습니다.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!friend) return;
    if (deleteInput.trim() !== friend.name) return toast("삭제할 학생의 이름을 정확히 입력해 주세요.", "error");
    if (registryLocked) return toast(registryLockText, "error");
    if (friend.rosterSync && !canSyncRoster) return toast("출석부 연동 삭제는 통합관리자만 할 수 있습니다.", "error");
    setSaving(true);
    try {
      if (friend.rosterSync) {
        await removeNewFriendFromRoster(
          sid,
          friend,
          priv ?? {},
          user?.displayName || user?.email || user?.uid,
        );
        toast("새친구 명단과 학생 출석부에서 삭제했습니다.", "success");
      } else {
        await removeNewFriend(sid, friend);
        toast("새친구 기록을 삭제했습니다.", "success");
      }
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : "삭제에 실패했습니다.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelPlacement() {
    if (!friend || (!friend.assignedClassKey && !friend.rosterSync)) return;
    if (registryLocked) return toast(registryLockText, "error");
    if (friend.rosterSync && !canSyncRoster) return toast("출석부 연동 배정 취소는 통합관리자만 할 수 있습니다.", "error");
    const confirmed = await uiConfirm(
      friend.rosterSync
        ? `${friend.name}님의 등반과 반 배정을 취소할까요? 새친구 기록은 유지하지만 출석부 학생과 출석 기록은 백업 후 제거되며, 다시 반을 배정해야 합니다.`
        : `${friend.name}님의 등반과 반 배정을 취소할까요? 배정 반을 비웁니다.`,
    );
    if (!confirmed) return;
    setSaving(true);
    try {
      await cancelNewFriendPlacement(
        sid,
        friend,
        priv ?? {},
        user?.displayName || user?.email || user?.uid,
      );
      toast("등반 및 배정을 취소했습니다. 새친구 기록은 유지됩니다.", "success");
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : "등반 및 배정 취소에 실패했습니다.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <OverlayShell
      label={friend ? `${friend.name} 새친구 수정` : "새친구 접수"}
      onClose={onClose}
      variant="fullscreen-mobile"
      panelClassName="new-friend-editor"
    >
        <div className="overlay-panel-header flex items-start justify-between gap-3">
          <div>
            <p className="section-kicker">새친구</p>
            <h3 className="text-lg font-bold text-slate-900">{friend ? `${friend.name} 기록 수정` : "새친구 접수"}</h3>
          </div>
          <button type="button" onClick={onClose} className="compact-icon-control rounded-lg text-slate-400 hover:bg-slate-100" aria-label="닫기"><X aria-hidden="true" size={17} weight="bold" /></button>
        </div>

        <div className="overlay-panel-body">
        {registryLocked && <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">{registryLockText}</div>}
        {rosterLocked && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            출석부 반영이 완료되어 이름·부서·학년·연락처·배정 반은 잠겼습니다. 학생 정보 변경은 학생 출석부에서 처리하고, 여기서는 등록일·담당·목양 메모를 갱신해 주세요. 명단 삭제는 통합관리자가 새친구 기록과 출석부를 함께 정리할 수 있습니다.
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="이름 *"><input className="input" value={draft.name} onChange={(e) => set("name", e.target.value)} disabled={rosterLocked} /></Field>
          <Field label="새친구 등록일"><input type="date" className="input" value={draft.registeredDate} onChange={(e) => set("registeredDate", e.target.value)} /></Field>
          <Field label="부서"><select className="input" value={draft.part} onChange={(e) => { set("part", e.target.value as Draft["part"]); set("assignedClassKey", ""); }} disabled={rosterLocked}><option>1부</option><option>2부</option></select></Field>
          <Field label="학년"><select className="input" value={draft.grade} onChange={(e) => { set("grade", e.target.value); set("assignedClassKey", ""); }} disabled={rosterLocked}>{[1, 2, 3].map((grade) => <option key={grade} value={grade}>{grade}학년</option>)}</select></Field>
          <Field label="성별"><select className="input" value={draft.gender} onChange={(e) => set("gender", e.target.value as Draft["gender"])} disabled={rosterLocked}><option value="">미입력</option><option>남</option><option>여</option></select></Field>
          <Field label="학교"><input className="input" value={draft.school} onChange={(e) => set("school", e.target.value)} disabled={rosterLocked} /></Field>
          <Field label="생년월일"><input type="date" className="input" value={draft.birth} onChange={(e) => set("birth", e.target.value)} disabled={rosterLocked} /></Field>
          <Field label="본인 연락처"><input type="tel" inputMode="numeric" className="input" value={draft.phone} onChange={(e) => set("phone", formatKoreanPhone(e.target.value))} placeholder="010-0000-0000" disabled={rosterLocked} /></Field>
          <Field label="보호자 연락처"><input type="tel" inputMode="numeric" className="input" value={draft.parentPhone} onChange={(e) => set("parentPhone", formatKoreanPhone(e.target.value))} placeholder="010-0000-0000" disabled={rosterLocked} /></Field>
          <Field label="주소"><input className="input" value={draft.address} onChange={(e) => set("address", e.target.value)} disabled={rosterLocked} /></Field>
          <Field label="바나바 담당자"><input className="input" value={draft.owner} onChange={(e) => set("owner", e.target.value)} /></Field>
          <Field label="1주차"><input type="date" className="input" value={draft.week1Date} onChange={(e) => set("week1Date", e.target.value)} /></Field>
          <Field label="2주차"><input type="date" className="input" value={draft.week2Date} onChange={(e) => set("week2Date", e.target.value)} /></Field>
          <Field label="등록 결정"><select className="input" value={draft.decision} onChange={(e) => set("decision", e.target.value as NewFriendDecision)} disabled={rosterLocked}>{["미정", "등록", "보류", "미등록"].map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label="인도자"><select className="input" value={draft.inviter} onChange={(e) => set("inviter", e.target.value)}><option value="">선택</option>{draft.inviter && !NEW_FRIEND_INVITER_OPTIONS.includes(draft.inviter as (typeof NEW_FRIEND_INVITER_OPTIONS)[number]) && <option value={draft.inviter}>{draft.inviter} (기존값)</option>}{NEW_FRIEND_INVITER_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}</select></Field>
          <Field label="신급"><select className="input" value={draft.faithStep} onChange={(e) => set("faithStep", e.target.value)}><option value="">선택</option>{draft.faithStep && !NEW_FRIEND_FAITH_STEP_OPTIONS.includes(draft.faithStep as (typeof NEW_FRIEND_FAITH_STEP_OPTIONS)[number]) && <option value={draft.faithStep}>{draft.faithStep} (기존값)</option>}{NEW_FRIEND_FAITH_STEP_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}</select></Field>
          <Field label="배정 반"><select className="input" value={draft.assignedClassKey} onChange={(e) => set("assignedClassKey", e.target.value)} disabled={rosterLocked}><option value="">미배정</option>{classOptions.map((item) => <option key={item.classKey} value={item.classKey}>{formatClassLabel(item.classKey)}{item.teacher ? ` · ${item.teacher}` : ""}</option>)}</select></Field>
          <Field label="교회 내 지인"><input className="input" value={draft.churchFriend} onChange={(e) => set("churchFriend", e.target.value)} /></Field>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="비고"><textarea className="input min-h-24" value={draft.teamMemo} onChange={(e) => set("teamMemo", e.target.value)} /></Field>
          <Field label="가족사항"><textarea className="input min-h-24" value={draft.familyNotes} onChange={(e) => set("familyNotes", e.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="교역자 심방·특이사항"><textarea className="input min-h-24" value={draft.pastoralNotes} onChange={(e) => set("pastoralNotes", e.target.value)} /></Field></div>
        </div>

        {deleteConfirming && friend && (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-bold text-red-800">삭제 전 마지막 확인</p>
            <p className="mt-1 text-xs leading-5 text-red-700">
              {friend.rosterSync
                ? "새친구 명단, 출석부 학생, 해당 학생의 출석 기록에서 함께 삭제됩니다. 비공개 사전 백업과 출석부 휴지통에는 복구용 사본이 남습니다."
                : "새친구 공개·비공개 기록이 삭제됩니다."}
            </p>
            <label className="mt-3 block text-xs font-semibold text-red-800">
              계속하려면 <strong>{friend.name}</strong>을(를) 입력하세요.
              <input
                className="input mt-1 border-red-200 bg-white"
                value={deleteInput}
                onChange={(event) => setDeleteInput(event.target.value)}
                autoComplete="off"
                aria-label="삭제할 학생 이름 확인"
              />
            </label>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => { setDeleteConfirming(false); setDeleteInput(""); }} disabled={saving}>삭제 취소</button>
              <button type="button" className="btn-danger" onClick={handleDelete} disabled={saving || deleteInput.trim() !== friend.name}>
                {saving ? "삭제 중…" : friend.rosterSync ? "명단·출석부에서 삭제" : "명단에서 삭제"}
              </button>
            </div>
          </div>
        )}
        </div>

        <div className="overlay-panel-footer flex flex-wrap justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {friend && (!friend.rosterSync || canSyncRoster) && !deleteConfirming && (
              <button type="button" className="btn-danger" onClick={() => setDeleteConfirming(true)} disabled={saving}>
                {friend.rosterSync ? "명단·출석부 삭제" : "명단 삭제"}
              </button>
            )}
            {friend && (friend.assignedClassKey || friend.rosterSync) && (!friend.rosterSync || canSyncRoster) && !deleteConfirming && (
              <button type="button" className="btn-secondary border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100" onClick={handleCancelPlacement} disabled={saving}>
                등반 및 배정 취소
              </button>
            )}
            {friend?.rosterSync && !canSyncRoster && <p className="text-xs text-slate-400">출석부 연동 삭제·배정 취소는 통합관리자만 가능합니다.</p>}
          </div>
          <div className="flex gap-2"><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>취소</button><button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? "저장 중…" : "저장"}</button></div>
        </div>
    </OverlayShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0 text-xs font-semibold text-slate-500"><span className="mb-1 block">{label}</span>{children}</label>;
}

function yearForStorageSid(sid: string) {
  const match = sid.match(/^\d{4}/);
  return match?.[0] ?? String(new Date().getFullYear());
}

export default function NewFriendsTab({
  sid,
  friends,
  privateMap,
  canSyncRoster,
  canSubmitRegistry = false,
  getStorageSid,
  getPrivateValue,
  getRecordKey,
}: Props) {
  const { user } = useAuth();
  const { toast, uiConfirm } = useUI();
  const canEdit = useSemesterCanEdit();
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchInputId = useId();
  const [editing, setEditing] = useState<NewFriend | "new" | null>(null);
  const [classesBySid, setClassesBySid] = useState<Record<string, ClassInfo[]>>({});
  const [classError, setClassError] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [ledgers, setLedgers] = useState<Record<string, YearLedger>>({});
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [registryStates, setRegistryStates] = useState<Record<string, RegistryState>>({});
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [registryAttempt, setRegistryAttempt] = useState(0);
  const [ledgerAttempt, setLedgerAttempt] = useState(0);
  const storageSidFor = (friend: NewFriend) => getStorageSid?.(friend) ?? sid;
  const privateValueFor = (friend: NewFriend) => getPrivateValue?.(friend) ?? privateMap[friend.id];
  const recordKeyFor = (friend: NewFriend) => getRecordKey?.(friend) ?? friend.id;
  const storageSids = useMemo(() => [...new Set([
    sid,
    ...friends.map((friend) => getStorageSid?.(friend) ?? sid),
  ])].sort(), [friends, getStorageSid, sid]);
  const years = useMemo(() => [...new Set(storageSids.map(yearForStorageSid))].sort(), [storageSids]);
  /** 그 새친구 학기 연도의 원장. 2026 이하는 불러오기 전에도 legacy(지금 화면 그대로), 2027 이후는 모르면 undefined(단추 숨김). */
  const ledgerFor = (friend: NewFriend): YearLedger | undefined => {
    const year = yearForStorageSid(storageSidFor(friend));
    return ledgers[year] ?? (defaultLedger(Number(year)) === "legacy" ? "legacy" : undefined);
  };
  const registryIds = useMemo(() => friends
    .filter((friend) => ledgers[yearForStorageSid(getStorageSid?.(friend) ?? sid)] === "wooriteens")
    .map((friend) => friend.id).sort(), [friends, ledgers, getStorageSid, sid]);
  const registryKey = registryIds.join("|");

  useEffect(() => {
    let active = true;
    setLedgerError(null);
    years.forEach((year) => {
      fetchYearLedger(Number(year)).then((ledger) => {
        if (active) setLedgers((current) => current[year] === ledger ? current : { ...current, [year]: ledger });
      }).catch((error: Error) => {
        if (active) setLedgerError((current) => [current, `${year}: ${error.message}`].filter(Boolean).join(" / "));
      });
    });
    return () => { active = false; };
  }, [years, ledgerAttempt]);

  useEffect(() => {
    if (!registryKey) return;
    let active = true;
    setRegistryError(null);
    fetchRegistryStates(registryKey.split("|")).then((states) => {
      if (active) setRegistryStates(states);
    }).catch((error: Error) => {
      if (active) setRegistryError(error.message);
    });
    return () => { active = false; };
  }, [registryKey, registryAttempt]);

  const registryStateFor = (friend: NewFriend) => ledgerFor(friend) === "wooriteens" ? registryStates[friend.id] : undefined;
  const progressFor = (friend: NewFriend) => ledgerFor(friend) === "wooriteens"
    ? deriveRegistryProgress(friend, registryStates[friend.id])
    : deriveNewFriendRosterProgress(friend);

  useEffect(() => {
    setClassError(null);
    if (!user) return;
    const controller = new AbortController();
    storageSids.forEach((storageSid) => {
      const year = yearForStorageSid(storageSid);
      fetchClassOptions(user, storageSid, controller.signal).then((next) => {
        if (!controller.signal.aborted) setClassesBySid((current) => ({ ...current, [storageSid]: next }));
      }).catch((error: Error) => {
        if (!controller.signal.aborted) setClassError((current) => [current, `${year}: ${error.message}`].filter(Boolean).join(" / "));
      });
    });
    return () => controller.abort();
  }, [user, storageSids]);

  const stageCounts = useMemo(() => friends.reduce<Record<string, number>>((acc, friend) => {
    const ledger = ledgers[yearForStorageSid(getStorageSid?.(friend) ?? sid)];
    const stage = ledger === "wooriteens" && registryStates[friend.id]?.stage === "registered" ? "완료" : deriveNewFriendStage(friend);
    acc[stage] = (acc[stage] ?? 0) + 1;
    return acc;
  }, {}), [friends, ledgers, registryStates, getStorageSid, sid]);
  const assignmentCandidates = useMemo(
    () => friends.filter(needsClassAssignment),
    [friends],
  );
  const filteredRows = useMemo(() => friends
    .map((friend, index) => ({ friend, number: index + 1 }))
    .filter(({ friend }) => matchesNewFriendSearch(friend, searchQuery, canEdit
      ? (getPrivateValue?.(friend) ?? privateMap[friend.id])
      : undefined)), [friends, searchQuery, canEdit, getPrivateValue, privateMap]);
  const isSearching = searchQuery.trim().length > 0;

  function clearSearch() {
    setSearchQuery("");
    searchInputRef.current?.focus();
  }

  async function copyAssignment(friend: NewFriend) {
    try {
      await navigator.clipboard.writeText(newFriendAssignmentCopyText(friend, privateValueFor(friend) ?? {}));
      toast(`${friend.name} 학생 정보를 복사했습니다.`, "success");
    } catch {
      toast("클립보드 복사에 실패했습니다. 브라우저 권한을 확인해 주세요.", "error");
    }
  }

  async function handleSync(friend: NewFriend) {
    const validationError = validateNewFriendRosterRegistration(friend);
    if (validationError) return toast(validationError, "error");
    const confirmed = await uiConfirm(
      `${friend.name}님을 ${friend.assignedClassKey}반 학생으로 등록합니다. 이름 중복과 대상 반을 다시 확인한 뒤 단일 학생 경로만 추가합니다.`,
    );
    if (!confirmed) return;
    setSyncingId(friend.id);
    try {
      const friendSid = storageSidFor(friend);
      const result = await registerNewFriendInRoster(
        friendSid,
        friend,
        privateValueFor(friend) ?? {},
        user?.displayName || user?.email || user?.uid,
      );
      toast(result.alreadySynced ? "이미 등록된 학생을 확인해 연결했습니다." : "학생 출석부에 반영했습니다.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "출석부 반영에 실패했습니다.", "error");
    } finally {
      setSyncingId(null);
    }
  }

  async function handleRegistrySubmit(friend: NewFriend) {
    const year = Number(yearForStorageSid(storageSidFor(friend)));
    const submission = buildRegistrySubmission(friend, privateValueFor(friend) ?? {}, year, koreaDateInputValue());
    if ("error" in submission) return toast(submission.error, "error");
    const confirmed = await uiConfirm([
      `${friend.name}님을 우리틴즈 교적의 새친구 접수 대기에 보냅니다(${formatClassLabel(submission.classKey)}).`,
      "바나바 담당·인도자·신급·지인·1·2주차·비고 메모·연락처도 함께 넘어가고, 1·2주차·등록 결정은 우리틴즈 새친구 화면에서 이어서 합니다.",
      "교적 행정팀이 중복 확인 뒤 등록과 반 배정을 하고, 등록되면 이 표에 반과 첫 출석이 보입니다.",
      `출생연도 ${submission.birthYear}${submission.birthYearEstimated ? "(학년으로 짐작한 값)" : ""} · 첫 방문 ${submission.firstVisitDate}${submission.firstVisitClamped ? "(교적은 그 해 날짜만 받아 고친 값)" : ""}.`,
    ].join(" "));
    if (!confirmed) return;
    setSyncingId(friend.id);
    try {
      const state = await submitNewFriendToRegistry(submission);
      setRegistryStates((current) => ({ ...current, [friend.id]: state }));
      const skipped = skippedText(state.skipped);
      toast([state.existing ? "이미 교적에 접수된 새친구라 넘긴 칸을 새 값으로 바꿨습니다." : "교적 새친구 접수 대기에 보냈습니다.", skipped].filter(Boolean).join(" "), "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "교적 접수에 실패했습니다.", "error");
    } finally {
      setSyncingId(null);
      setRegistryAttempt((value) => value + 1);
    }
  }

  async function handleRegistryCancel(friend: NewFriend) {
    const confirmed = await uiConfirm(`${friend.name}님의 교적 접수를 취소할까요? 교적의 접수 대기에서 빠지고, 다시 보낼 수 있습니다.`);
    if (!confirmed) return;
    setSyncingId(friend.id);
    try {
      const state = await cancelNewFriendRegistry(friend.id);
      setRegistryStates((current) => ({ ...current, [friend.id]: state }));
      toast("교적 접수를 취소했습니다.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "교적 접수 취소에 실패했습니다.", "error");
    } finally {
      setSyncingId(null);
      setRegistryAttempt((value) => value + 1);
    }
  }

  /** 우리틴즈 원장 해의 "출석부" 칸: 교적 단계와 접수·취소 단추. */
  function registryCell(friend: NewFriend, mobile: boolean) {
    const state = registryStates[friend.id];
    const busy = syncingId === friend.id;
    const ready = !registryReadiness(friend);
    if (!state && !registryError) return <span className="text-[11px] text-slate-400">교적 확인 중…</span>;
    if (state?.stage === "registered") {
      return <div>
        <span className="inline-flex whitespace-nowrap rounded-md bg-teal-100 px-2 py-1 text-[11px] font-medium text-teal-700">교적 등록</span>
        <span className="mt-1 block text-[11px] text-slate-500">{state.classLabel ?? formatClassLabel(state.submittedClassKey)} · {state.firstAttended ? `첫 출석 ${state.firstAttended}` : "첫 출석 전"}</span>
      </div>;
    }
    if (state?.stage === "submitted") {
      return <div className={mobile ? "flex w-full items-center justify-between gap-2" : ""}>
        <span className="inline-flex whitespace-nowrap rounded-md bg-sky-100 px-2 py-1 text-[11px] font-medium text-sky-700">교적 접수됨</span>
        {canSubmitRegistry && <button type="button" className={`btn-secondary whitespace-nowrap px-2 py-1 text-[11px] ${mobile ? "" : "mt-1 block"}`} onClick={() => handleRegistryCancel(friend)} disabled={busy}>{busy ? "취소 중…" : "접수 취소"}</button>}
      </div>;
    }
    if (!ready) return <span className="text-[11px] text-slate-400">{mobile ? "교적 접수 준비 필요" : "준비 필요"}</span>;
    if (!canSendToRegistry(state)) return <span className="text-[11px] text-slate-400">확인 필요</span>;
    return <div className={mobile ? "w-full" : ""}>
      {state?.stage === "dismissed" && <span className="mb-1 block text-[10px] text-slate-500">교적에서 정리됨</span>}
      {canSubmitRegistry
        ? <button type="button" className={`btn-primary whitespace-nowrap px-2.5 py-1.5 text-[11px] ${mobile ? "w-full justify-center" : ""}`} onClick={() => handleRegistrySubmit(friend)} disabled={busy || Boolean(registryError)}>{busy ? "보내는 중…" : "교적에 접수"}</button>
        : <span className="inline-flex rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">관리자 확인 대기</span>}
    </div>;
  }

  return (
    <div>
      {classError && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">⚠ 학생 원장 로드 오류: {classError}</div>}
      {(ledgerError || registryError) && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">⚠ 우리틴즈 교적 연동 확인 오류: {[ledgerError, registryError].filter(Boolean).join(" / ")} <button type="button" className="ml-2 underline" onClick={() => { setLedgerAttempt((value) => value + 1); setRegistryAttempt((value) => value + 1); }}>다시 확인</button></div>}
      {Object.values(ledgers).includes("wooriteens") && <div role="note" className="mb-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">2027년부터 새친구는 우리틴즈 출석부 › 목양 관리 › 새친구에서 기록합니다(1·2주차·등록 보류·메모·등반까지). 여기에 남은 새친구는 배정 반을 고른 뒤 ‘교적에 접수’로 넘겨 주세요. 바나바 칸·메모·연락처도 함께 넘어갑니다.</div>}
      {!canEdit && <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-500">조회 전용 역할입니다. 민감정보는 표시되지 않으며 새친구 기록을 수정할 수 없습니다.</div>}

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {["1주차", "2주차", "출석부 반영", "완료"].map((stage) => <div key={stage} className="card p-3"><p className="text-xs text-slate-400">{stage}</p><p className="mt-1 text-xl font-bold text-slate-900">{stageCounts[stage] ?? 0}<span className="ml-1 text-xs font-normal text-slate-400">명</span></p></div>)}
      </div>

      {canEdit && assignmentCandidates.length > 0 && (
        <section className="card card-body mb-4" aria-labelledby="assignment-needed-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 id="assignment-needed-title" className="font-semibold text-slate-900">반 배정해야 하는 학생</h3>
            </div>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">{assignmentCandidates.length}명</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {assignmentCandidates.map((friend) => (
              <article key={recordKeyFor(friend)} className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 text-sm leading-6 text-slate-700">
                    <p><span className="text-slate-400">이름 :</span> <strong className="text-slate-900">{friend.name}</strong></p>
                    <p><span className="text-slate-400">부서 :</span> {friend.part}</p>
                    <p><span className="text-slate-400">학년 :</span> {formatNewFriendGrade(friend.grade)}</p>
                    <p><span className="text-slate-400">성별 :</span> {friend.gender || "미입력"}</p>
                  </div>
                  <button type="button" className="btn-secondary shrink-0 px-2.5 py-1.5 text-[11px]" onClick={() => copyAssignment(friend)} aria-label={`${friend.name} 학생 정보 복사`}>
                    📋 복사
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="card card-body">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="font-semibold text-slate-900">새친구 진행 현황</h3></div>
          {canEdit && <button type="button" className="btn-primary" onClick={() => setEditing("new")}>+ 새친구 접수</button>}
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full sm:max-w-xl">
            <label className="mb-1.5 block text-xs font-semibold text-slate-600" htmlFor={searchInputId}>새친구 검색</label>
            <div className="flex items-center gap-2">
              <input
                ref={searchInputRef}
                id={searchInputId}
                type="search"
                className="input min-w-0"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={canEdit ? "이름, 학교, 바나바 담당, 연락처" : "이름, 학교, 바나바 담당"}
                autoComplete="off"
              />
              {searchQuery && <button type="button" className="btn-secondary shrink-0" onClick={clearSearch} aria-label="새친구 검색 초기화">초기화</button>}
            </div>
          </div>
          <p role="status" className="shrink-0 text-xs tabular-nums text-slate-500">
            {isSearching ? <>검색 결과 <strong className="text-slate-900">{filteredRows.length}명</strong> / 전체 {friends.length}명</> : <>전체 <strong className="text-slate-900">{friends.length}명</strong></>}
          </p>
        </div>
        {isSearching && filteredRows.length === 0 && (
          <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center">
            <p className="text-sm font-semibold text-slate-700">검색 결과가 없습니다.</p>
            <p className="mt-1 text-xs text-slate-500">이름이나 검색 조건을 바꾸거나 전체 목록을 확인해 주세요.</p>
            <button type="button" className="btn-secondary mt-4" onClick={clearSearch}>전체 목록 보기</button>
          </div>
        )}

        {(!isSearching || filteredRows.length > 0) && <>
        <div className="mt-4 space-y-3 sm:hidden" aria-label="새친구 진행 현황 모바일 목록">
          {filteredRows.map(({ friend, number }) => {
            const progress = progressFor(friend);
            const priv = privateValueFor(friend);
            const syncReady = !validateNewFriendRosterRegistration(friend) && !friend.rosterSync;
            return (
              <article key={`mobile:${recordKeyFor(friend)}`} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold tabular-nums text-slate-400">No. {number} · 등록일 {newFriendRegisteredDate(friend)}</p>
                    <button type="button" className="mt-0.5 text-left" onClick={() => canEdit && setEditing(friend)} disabled={!canEdit}>
                      <strong className="text-base text-slate-900">{friend.name}</strong>
                    </button>
                    <p className="mt-1 text-xs text-slate-500">{friend.school || "학교 미입력"}</p>
                  </div>
                  <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${PROGRESS_STYLE[progress]}`}>{progress}</span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                  <div><dt className="text-slate-400">부서 / 학년</dt><dd className="mt-1 font-medium text-slate-700">{friend.part} / {formatNewFriendGrade(friend.grade)}</dd></div>
                  <div><dt className="text-slate-400">바나바 담당</dt><dd className="mt-1 font-medium text-slate-700">{friend.owner || "미배정"}</dd></div>
                  <div><dt className="text-slate-400">1주차</dt><dd className="mt-1 tabular-nums text-slate-700">{friend.week1Date || "-"}</dd></div>
                  <div><dt className="text-slate-400">2주차</dt><dd className="mt-1 tabular-nums text-slate-700">{friend.week2Date || "-"}</dd></div>
                  <div><dt className="text-slate-400">등록 결정</dt><dd className="mt-1 font-medium text-slate-700">{friend.decision}</dd></div>
                  <div><dt className="text-slate-400">배정 반</dt><dd className="mt-1 font-medium text-slate-700">{formatClassLabel(friend.assignedClassKey)}</dd></div>
                </dl>
                {canEdit && (
                  <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                    <span className="block">본인 {formatKoreanPhone(priv?.phone) || "-"}</span>
                    <span className="block text-slate-400">보호자 {formatKoreanPhone(priv?.parentPhone) || "-"}</span>
                  </div>
                )}
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                  {ledgerFor(friend) === "wooriteens" ? registryCell(friend, true) : ledgerFor(friend) === undefined ? <span className="text-xs text-slate-400">원장 확인 중…</span> : friend.rosterSync ? (
                    <span className="text-xs font-semibold text-emerald-700">출석부 반영 완료</span>
                  ) : syncReady ? (
                    canSyncRoster ? <button type="button" className="btn-primary w-full justify-center text-xs" onClick={() => handleSync(friend)} disabled={syncingId === friend.id}>{syncingId === friend.id ? "반영 중…" : "출석부 반영"}</button>
                      : <span className="text-xs font-medium text-amber-700">관리자 확인 대기</span>
                  ) : <span className="text-xs text-slate-400">출석부 반영 준비 필요</span>}
                </div>
              </article>
            );
          })}
          {friends.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">접수된 새친구가 없습니다.</div>}
        </div>

        <div className="mt-4 hidden max-h-[68vh] overflow-auto rounded-xl border border-slate-200 sm:block">
          <table className="w-full min-w-[1390px] border-collapse text-left text-xs">
            <caption className="sr-only">새친구별 등록일, 연락처, 담당자, 2주 과정, 등록 결정, 배정 반과 출석부 반영 현황</caption>
            <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-semibold text-slate-500 shadow-[0_1px_0_#e2e8f0]">
              <tr>
                <th className="w-12 px-3 py-3 text-center">No.</th>
                <th className="min-w-28 px-3 py-3">등록일</th>
                <th className="min-w-28 px-3 py-3">이름</th>
                <th className="min-w-32 px-3 py-3">학교</th>
                <th className="min-w-24 px-3 py-3">부서 / 학년</th>
                <th className="min-w-24 px-3 py-3">바나바 담당</th>
                <th className="min-w-24 px-3 py-3">1주차</th>
                <th className="min-w-24 px-3 py-3">2주차</th>
                <th className="min-w-24 px-3 py-3">등록 결정</th>
                <th className="min-w-20 px-3 py-3">배정 반</th>
                {canEdit && <th className="min-w-48 px-3 py-3">연락처 <span className="font-normal text-slate-400">(본인 / 보호자)</span></th>}
                <th className="min-w-24 px-3 py-3">진행 상태</th>
                <th className="min-w-32 px-3 py-3">출석부</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
          {filteredRows.map(({ friend, number }) => {
            const progress = progressFor(friend);
            const priv = privateValueFor(friend);
            const syncReady = !validateNewFriendRosterRegistration(friend) && !friend.rosterSync;
            return (
              <tr key={recordKeyFor(friend)} className="transition-colors hover:bg-slate-50/80">
                <td className="px-3 py-3 text-center tabular-nums text-slate-400">{number}</td>
                <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-600">{newFriendRegisteredDate(friend)}</td>
                <td className="px-3 py-3">
                  <button type="button" className={`block text-left ${canEdit ? "hover:text-emerald-700 hover:underline" : "cursor-default"}`} onClick={() => canEdit && setEditing(friend)} disabled={!canEdit}>
                    <strong className="block text-sm text-slate-900">{friend.name}</strong>
                  </button>
                </td>
                <td className="max-w-40 truncate px-3 py-3 text-slate-600">{friend.school || "-"}</td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-600">{friend.part} · {formatNewFriendGrade(friend.grade)}</td>
                <td className="px-3 py-3 text-slate-600">{friend.owner || "미배정"}</td>
                <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-600">{friend.week1Date || "-"}</td>
                <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-600">{friend.week2Date || "-"}</td>
                <td className="px-3 py-3"><span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700">{friend.decision}</span></td>
                <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-700">{formatClassLabel(friend.assignedClassKey)}</td>
                {canEdit && <td className="px-3 py-3 leading-5 text-slate-600"><span className="block">본인 {formatKoreanPhone(priv?.phone) || "-"}</span><span className="block text-slate-400">보호자 {formatKoreanPhone(priv?.parentPhone) || "-"}</span></td>}
                <td className="px-3 py-3"><span className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold ${PROGRESS_STYLE[progress]}`}>{progress}</span></td>
                <td className="px-3 py-3">
                  {ledgerFor(friend) === "wooriteens" ? registryCell(friend, false) : ledgerFor(friend) === undefined ? <span className="text-[11px] text-slate-400">원장 확인 중…</span> : friend.rosterSync ? <div>
                    <span className="inline-flex rounded-md bg-emerald-50 px-2 py-1 font-medium text-emerald-700">반영 완료</span>
                    <span className="mt-1 block max-w-32 truncate text-[10px] text-emerald-700/70">{friend.rosterSync.studentId}</span>
                  </div> : syncReady ? <>
                    {canSyncRoster && <button type="button" className="btn-primary whitespace-nowrap px-2.5 py-1.5 text-[11px]" onClick={() => handleSync(friend)} disabled={syncingId === friend.id}>{syncingId === friend.id ? "반영 중…" : "출석부 반영"}</button>}
                    {!canSyncRoster && <span className="inline-flex rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">관리자 확인 대기</span>}
                  </> : <span className="text-[11px] text-slate-400">준비 필요</span>}
                </td>
              </tr>
            );
          })}
          {friends.length === 0 && <tr><td colSpan={canEdit ? 13 : 12} className="py-14 text-center text-sm text-slate-400">접수된 새친구가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
        </>}
      </div>

      {editing && (() => {
        const friend = editing === "new" ? null : editing;
        const editorSid = friend ? storageSidFor(friend) : sid;
        return <NewFriendEditor
          sid={editorSid}
          friend={friend}
          priv={friend ? privateValueFor(friend) : undefined}
          classes={classesBySid[editorSid] ?? []}
          canSyncRoster={canSyncRoster}
          registryStage={friend ? registryStateFor(friend)?.stage : undefined}
          onClose={() => setEditing(null)}
        />;
      })()}
    </div>
  );
}
