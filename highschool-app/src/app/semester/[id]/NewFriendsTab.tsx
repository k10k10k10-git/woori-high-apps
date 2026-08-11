"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useUI } from "@/context/UIContext";
import {
  getClassesByYear,
  registerNewFriendInRoster,
  removeNewFriend,
  saveNewFriend,
} from "@/features/semester/db";
import { useSemesterCanEdit } from "@/features/semester/EditContext";
import { deriveNewFriendStage, validateNewFriendRosterRegistration } from "@/features/semester/newFriend";
import type {
  ClassInfo,
  NewFriend,
  NewFriendDecision,
  NewFriendPrivate,
  NewFriendStage,
} from "@/features/semester/types";

interface Props {
  sid: string;
  friends: NewFriend[];
  privateMap: Record<string, NewFriendPrivate>;
  canSyncRoster: boolean;
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
  inviter: string;
  faithStep: string;
  assignedClassKey: string;
  giftDate: string;
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
  inviter: "",
  faithStep: "",
  assignedClassKey: "",
  giftDate: "",
  birth: "",
  phone: "",
  parentPhone: "",
  address: "",
  churchFriend: "",
  teamMemo: "",
  familyNotes: "",
  pastoralNotes: "",
};

const STAGE_STYLE: Record<NewFriendStage, string> = {
  접수: "bg-sky-100 text-sky-700",
  "1주차": "bg-blue-100 text-blue-700",
  "2주차": "bg-indigo-100 text-indigo-700",
  "등록 결정": "bg-violet-100 text-violet-700",
  반배정: "bg-amber-100 text-amber-800",
  "출석부 반영": "bg-orange-100 text-orange-800",
  "등반 확인": "bg-emerald-100 text-emerald-700",
  완료: "bg-teal-100 text-teal-700",
  보류: "bg-slate-100 text-slate-600",
  종료: "bg-rose-100 text-rose-700",
};

function draftFor(friend: NewFriend | null, priv: NewFriendPrivate | undefined): Draft {
  if (!friend) return EMPTY_DRAFT;
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
    inviter: friend.inviter ?? "",
    faithStep: friend.faithStep ?? "",
    assignedClassKey: friend.assignedClassKey ?? "",
    giftDate: friend.giftDate ?? "",
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
  onClose,
}: {
  sid: string;
  friend: NewFriend | null;
  priv?: NewFriendPrivate;
  classes: ClassInfo[];
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { toast, uiConfirm } = useUI();
  const [draft, setDraft] = useState(() => draftFor(friend, priv));
  const [saving, setSaving] = useState(false);
  const rosterLocked = Boolean(friend?.rosterSync);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const classOptions = useMemo(() => classes
    .filter((item) => item.classKey.startsWith(`${draft.part === "1부" ? "1" : "2"}-${draft.grade}-`))
    .sort((a, b) => a.classKey.localeCompare(b.classKey, "ko")), [classes, draft.part, draft.grade]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);

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
              rosterSync: friend.rosterSync,
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
        inviter: draft.inviter.trim() || undefined,
        faithStep: draft.faithStep.trim() || undefined,
        assignedClassKey: draft.assignedClassKey || undefined,
        giftDate: draft.giftDate || undefined,
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
      });
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
    const confirmed = await uiConfirm(
      `${friend.name}님의 새친구 기록을 삭제합니다. 출석부에 반영된 기록은 삭제할 수 없습니다.`,
    );
    if (!confirmed) return;
    try {
      await removeNewFriend(sid, friend);
      toast("새친구 기록을 삭제했습니다.", "success");
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : "삭제에 실패했습니다.", "error");
    }
  }

  return (
    <div className="modal-overlay center-modal" role="dialog" aria-modal="true" aria-label={friend ? "새친구 수정" : "새친구 접수"} onClick={onClose}>
      <div className="modal-dialog max-h-[90vh] w-[min(760px,calc(100vw-24px))] max-w-3xl overflow-y-auto" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="section-kicker">새친구</p>
            <h3 className="text-lg font-bold text-slate-900">{friend ? `${friend.name} 기록 수정` : "새친구 접수"}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100" aria-label="닫기">✕</button>
        </div>

        {rosterLocked && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            출석부 반영이 완료되어 이름·부서·학년·연락처·배정 반은 잠겼습니다. 학생 정보 변경은 학생 출석부에서 처리하고, 여기서는 담당·선물·목양 메모만 갱신해 주세요.
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="이름 *"><input className="input" value={draft.name} onChange={(e) => set("name", e.target.value)} disabled={rosterLocked} /></Field>
          <Field label="부서"><select className="input" value={draft.part} onChange={(e) => { set("part", e.target.value as Draft["part"]); set("assignedClassKey", ""); }} disabled={rosterLocked}><option>1부</option><option>2부</option></select></Field>
          <Field label="학년"><select className="input" value={draft.grade} onChange={(e) => { set("grade", e.target.value); set("assignedClassKey", ""); }} disabled={rosterLocked}>{[1, 2, 3].map((grade) => <option key={grade} value={grade}>{grade}학년</option>)}</select></Field>
          <Field label="성별"><select className="input" value={draft.gender} onChange={(e) => set("gender", e.target.value as Draft["gender"])} disabled={rosterLocked}><option value="">미입력</option><option>남</option><option>여</option></select></Field>
          <Field label="학교"><input className="input" value={draft.school} onChange={(e) => set("school", e.target.value)} disabled={rosterLocked} /></Field>
          <Field label="생년월일"><input type="date" className="input" value={draft.birth} onChange={(e) => set("birth", e.target.value)} disabled={rosterLocked} /></Field>
          <Field label="본인 연락처"><input className="input" value={draft.phone} onChange={(e) => set("phone", e.target.value)} disabled={rosterLocked} /></Field>
          <Field label="주양육자 연락처"><input className="input" value={draft.parentPhone} onChange={(e) => set("parentPhone", e.target.value)} disabled={rosterLocked} /></Field>
          <Field label="주소"><input className="input" value={draft.address} onChange={(e) => set("address", e.target.value)} disabled={rosterLocked} /></Field>
          <Field label="바나바 담당자"><input className="input" value={draft.owner} onChange={(e) => set("owner", e.target.value)} /></Field>
          <Field label="1주차"><input type="date" className="input" value={draft.week1Date} onChange={(e) => set("week1Date", e.target.value)} /></Field>
          <Field label="2주차"><input type="date" className="input" value={draft.week2Date} onChange={(e) => set("week2Date", e.target.value)} /></Field>
          <Field label="등록 결정"><select className="input" value={draft.decision} onChange={(e) => set("decision", e.target.value as NewFriendDecision)} disabled={rosterLocked}>{["미정", "등록", "보류", "미등록"].map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label="인도자"><input className="input" value={draft.inviter} onChange={(e) => set("inviter", e.target.value)} /></Field>
          <Field label="신급"><input className="input" value={draft.faithStep} onChange={(e) => set("faithStep", e.target.value)} /></Field>
          <Field label="배정 반"><select className="input" value={draft.assignedClassKey} onChange={(e) => set("assignedClassKey", e.target.value)} disabled={rosterLocked}><option value="">미배정</option>{classOptions.map((item) => <option key={item.classKey} value={item.classKey}>{item.classKey}반{item.teacher ? ` · ${item.teacher}` : ""}</option>)}</select></Field>
          <Field label="등반 선물 전달일"><input type="date" className="input" value={draft.giftDate} onChange={(e) => set("giftDate", e.target.value)} /></Field>
          <Field label="교회 내 지인"><input className="input" value={draft.churchFriend} onChange={(e) => set("churchFriend", e.target.value)} /></Field>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="새친구팀 메모"><textarea className="input min-h-24" value={draft.teamMemo} onChange={(e) => set("teamMemo", e.target.value)} /></Field>
          <Field label="가족사항"><textarea className="input min-h-24" value={draft.familyNotes} onChange={(e) => set("familyNotes", e.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="교역자 심방·특이사항"><textarea className="input min-h-24" value={draft.pastoralNotes} onChange={(e) => set("pastoralNotes", e.target.value)} /></Field></div>
        </div>

        <div className="mt-5 flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-4">
          <div>{friend && !friend.rosterSync && <button type="button" className="btn-danger" onClick={handleDelete} disabled={saving}>삭제</button>}</div>
          <div className="flex gap-2"><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>취소</button><button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? "저장 중…" : "저장"}</button></div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-slate-500"><span className="mb-1 block">{label}</span>{children}</label>;
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
  getStorageSid,
  getPrivateValue,
  getRecordKey,
}: Props) {
  const { user } = useAuth();
  const { toast, uiConfirm } = useUI();
  const canEdit = useSemesterCanEdit();
  const [editing, setEditing] = useState<NewFriend | "new" | null>(null);
  const [classesByYear, setClassesByYear] = useState<Record<string, ClassInfo[]>>({});
  const [classError, setClassError] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const storageSidFor = (friend: NewFriend) => getStorageSid?.(friend) ?? sid;
  const privateValueFor = (friend: NewFriend) => getPrivateValue?.(friend) ?? privateMap[friend.id];
  const recordKeyFor = (friend: NewFriend) => getRecordKey?.(friend) ?? friend.id;
  const years = useMemo(() => [...new Set([
    yearForStorageSid(sid),
    ...friends.map((friend) => yearForStorageSid(getStorageSid?.(friend) ?? sid)),
  ])].sort(), [friends, getStorageSid, sid]);

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled(years.map(async (year) => [year, await getClassesByYear(year)] as const)).then((results) => {
      if (cancelled) return;
      const loaded: Record<string, ClassInfo[]> = {};
      const errors: string[] = [];
      results.forEach((result, index) => {
        if (result.status === "fulfilled") loaded[result.value[0]] = result.value[1];
        else errors.push(`${years[index]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
      });
      setClassesByYear(loaded);
      setClassError(errors.length > 0 ? errors.join(" / ") : null);
    });
    return () => { cancelled = true; };
  }, [years]);

  const stageCounts = useMemo(() => friends.reduce<Record<string, number>>((acc, friend) => {
    const stage = deriveNewFriendStage(friend);
    acc[stage] = (acc[stage] ?? 0) + 1;
    return acc;
  }, {}), [friends]);

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
      const year = yearForStorageSid(friendSid);
      const result = await registerNewFriendInRoster(
        friendSid,
        friend,
        privateValueFor(friend) ?? {},
        user?.displayName || user?.email || user?.uid,
      );
      toast(result.alreadySynced ? "이미 등록된 학생을 확인해 연결했습니다." : "학생 출석부에 반영했습니다.", "success");
      const refreshed = await getClassesByYear(year);
      setClassesByYear((current) => ({ ...current, [year]: refreshed }));
    } catch (error) {
      toast(error instanceof Error ? error.message : "출석부 반영에 실패했습니다.", "error");
    } finally {
      setSyncingId(null);
    }
  }

  return (
    <div>
      {classError && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">⚠ 학생 원장 로드 오류: {classError}</div>}
      {!canEdit && <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-500">조회 전용 역할입니다. 민감정보는 표시되지 않으며 새친구 기록을 수정할 수 없습니다.</div>}

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {["1주차", "2주차", "출석부 반영", "등반 확인"].map((stage) => <div key={stage} className="card p-3"><p className="text-xs text-slate-400">{stage}</p><p className="mt-1 text-xl font-bold text-slate-900">{stageCounts[stage] ?? 0}<span className="ml-1 text-xs font-normal text-slate-400">명</span></p></div>)}
      </div>

      <div className="card card-body">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="font-semibold text-slate-900">새친구 진행 현황</h3><p className="mt-1 text-xs text-slate-400">한 명씩 행으로 확인하고, 학생 이름을 누르면 상세 기록을 수정할 수 있습니다.</p></div>
          {canEdit && <button type="button" className="btn-primary" onClick={() => setEditing("new")}>+ 새친구 접수</button>}
        </div>

        <div className="mt-4 max-h-[68vh] overflow-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[1180px] border-collapse text-left text-xs">
            <caption className="sr-only">새친구별 연락처, 담당자, 2주 과정, 등록 결정, 배정 반과 출석부 반영 현황</caption>
            <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-semibold text-slate-500 shadow-[0_1px_0_#e2e8f0]">
              <tr>
                <th className="w-12 px-3 py-3 text-center">No.</th>
                <th className="min-w-36 px-3 py-3">학생</th>
                <th className="min-w-24 px-3 py-3">부서 / 학년</th>
                <th className="min-w-24 px-3 py-3">바나바 담당</th>
                <th className="min-w-24 px-3 py-3">1주차</th>
                <th className="min-w-24 px-3 py-3">2주차</th>
                <th className="min-w-24 px-3 py-3">등록 결정</th>
                <th className="min-w-20 px-3 py-3">배정 반</th>
                {canEdit && <th className="min-w-48 px-3 py-3">연락처 <span className="font-normal text-slate-400">(본인 / 주양육자)</span></th>}
                <th className="min-w-24 px-3 py-3">진행 상태</th>
                <th className="min-w-32 px-3 py-3">출석부</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
          {friends.map((friend, index) => {
            const stage = deriveNewFriendStage(friend);
            const priv = privateValueFor(friend);
            const syncReady = !validateNewFriendRosterRegistration(friend) && !friend.rosterSync;
            return (
              <tr key={recordKeyFor(friend)} className="transition-colors hover:bg-slate-50/80">
                <td className="px-3 py-3 text-center tabular-nums text-slate-400">{index + 1}</td>
                <td className="px-3 py-3">
                  <button type="button" className={`block text-left ${canEdit ? "hover:text-emerald-700 hover:underline" : "cursor-default"}`} onClick={() => canEdit && setEditing(friend)} disabled={!canEdit}>
                    <strong className="block text-sm text-slate-900">{friend.name}</strong>
                    <span className="mt-0.5 block max-w-40 truncate text-[11px] text-slate-400">{friend.school || "학교 미입력"}</span>
                  </button>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-600">{friend.part} · {friend.grade}학년</td>
                <td className="px-3 py-3 text-slate-600">{friend.owner || "미배정"}</td>
                <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-600">{friend.week1Date || "—"}</td>
                <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-600">{friend.week2Date || "—"}</td>
                <td className="px-3 py-3"><span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700">{friend.decision}</span></td>
                <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-700">{friend.assignedClassKey || "미배정"}</td>
                {canEdit && <td className="px-3 py-3 leading-5 text-slate-600"><span className="block">본인 {priv?.phone || "—"}</span><span className="block text-slate-400">주양육자 {priv?.parentPhone || "—"}</span></td>}
                <td className="px-3 py-3"><span className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold ${STAGE_STYLE[stage]}`}>{stage}</span></td>
                <td className="px-3 py-3">
                  {friend.rosterSync ? <div><span className="inline-flex rounded-md bg-emerald-50 px-2 py-1 font-medium text-emerald-700">반영 완료</span><span className="mt-1 block max-w-32 truncate text-[10px] text-slate-400">{friend.rosterSync.studentId}</span></div> : syncReady ? <>
                    {canSyncRoster && <button type="button" className="btn-primary whitespace-nowrap px-2.5 py-1.5 text-[11px]" onClick={() => handleSync(friend)} disabled={syncingId === friend.id}>{syncingId === friend.id ? "반영 중…" : "출석부 반영"}</button>}
                    {!canSyncRoster && <span className="inline-flex rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">관리자 확인 대기</span>}
                  </> : <span className="text-[11px] text-slate-400">준비 필요</span>}
                </td>
              </tr>
            );
          })}
          {friends.length === 0 && <tr><td colSpan={canEdit ? 11 : 10} className="py-14 text-center text-sm text-slate-400">접수된 새친구가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (() => {
        const friend = editing === "new" ? null : editing;
        const editorSid = friend ? storageSidFor(friend) : sid;
        return <NewFriendEditor
          sid={editorSid}
          friend={friend}
          priv={friend ? privateValueFor(friend) : undefined}
          classes={classesByYear[yearForStorageSid(editorSid)] ?? []}
          onClose={() => setEditing(null)}
        />;
      })()}
    </div>
  );
}
