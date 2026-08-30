import { useState } from "react";
import { deriveNewFriendStage, formatClassLabel } from "@/features/semester/newFriend";
import type { NewFriendPrivate } from "@/features/semester/types";
import { sundayFriendKey, type SundayAdminChange, type SundayNewFriend } from "./model";

type Props = {
  friends: SundayNewFriend[];
  privateValueFor: (friend: SundayNewFriend) => NewFriendPrivate | undefined;
  showPrivate: boolean;
  onOpenNewFriends: () => void;
};

const formatDate = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(date);
};

const recordKey = (friend: SundayNewFriend) => sundayFriendKey(friend.storageSid, friend.id);

export function RegistrationStatusTab({ friends }: Pick<Props, "friends">) {
  const synced = friends
    .filter((friend) => friend.rosterSync)
    .sort((a, b) => (b.rosterSync?.syncedAt ?? "").localeCompare(a.rosterSync?.syncedAt ?? ""));

  return (
    <section className="card card-body">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">등록 현황</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">새친구 등록으로 학생 출석부 원장에 반영된 학생을 모아봅니다.</p>
        </div>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">신규 등록 {synced.length}건</span>
      </div>
      <div className="mt-4 space-y-3 sm:hidden" aria-label="출석부 등록 현황 모바일 목록">
        {synced.map((friend) => (
          <article key={`mobile:${recordKey(friend)}`} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <strong className="text-slate-900">{friend.name}</strong>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">신규 등록</span>
            </div>
            <dl className="mt-4 grid gap-3 text-xs">
              <div><dt className="text-slate-400">반영 위치</dt><dd className="mt-1 font-medium text-slate-700">{formatClassLabel(friend.rosterSync?.classKey)}</dd></div>
              <div><dt className="text-slate-400">처리 시각</dt><dd className="mt-1 text-slate-600">{formatDate(friend.rosterSync?.syncedAt)}</dd></div>
            </dl>
          </article>
        ))}
        {synced.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">출석부에 반영된 새친구가 없습니다.</div>}
      </div>
      <div className="mt-4 hidden overflow-x-auto sm:block">
        <table className="min-w-full text-left text-xs">
          <thead><tr className="border-b border-slate-200 text-slate-400"><th className="px-3 py-2">학생</th><th className="px-3 py-2">변동 유형</th><th className="px-3 py-2">반영 위치</th><th className="px-3 py-2">처리 시각</th></tr></thead>
          <tbody>
            {synced.map((friend) => <tr key={recordKey(friend)} className="border-b border-slate-100"><td className="px-3 py-3 font-semibold text-slate-800">{friend.name}</td><td className="px-3 py-3 text-slate-600">새친구 신규 등록</td><td className="px-3 py-3 text-slate-600">{formatClassLabel(friend.rosterSync?.classKey)}</td><td className="px-3 py-3 text-slate-500">{formatDate(friend.rosterSync?.syncedAt)}</td></tr>)}
          </tbody>
        </table>
        {synced.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">출석부에 반영된 새친구가 없습니다.</div>}
      </div>
    </section>
  );
}

export function PendingTab({ friends, privateValueFor, showPrivate, onOpenNewFriends }: Props) {
  const pending = friends.filter((friend) => !["완료", "종료", "보류"].includes(deriveNewFriendStage(friend)));
  return (
    <section className="card card-body">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><h3 className="font-semibold text-slate-900">처리 대기</h3><p className="mt-1 text-xs leading-5 text-slate-500">2주 과정, 등록 결정, 반배정 또는 출석부 반영이 남은 새친구를 우선순위로 모았습니다.</p></div>
        <button type="button" className="btn-secondary justify-center" onClick={onOpenNewFriends}>새친구 화면에서 처리</button>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {pending.map((friend) => {
          const stage = deriveNewFriendStage(friend);
          const priv = privateValueFor(friend);
          return <article key={recordKey(friend)} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <strong className="text-slate-900">{friend.name}</strong>
              <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700">{stage}</span>
            </div>
            <p className="mt-2 text-xs text-slate-500">{friend.part} · {friend.grade}학년 · 담당 {friend.owner || "미배정"}</p>
            {showPrivate && <p className="mt-2 text-xs text-slate-500">연락처 {priv?.phone || "-"}</p>}
            <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-400">다음 확인: {nextAction(friend)}</p>
          </article>;
        })}
        {pending.length === 0 && <div className="col-span-full rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">처리 대기 중인 새친구가 없습니다.</div>}
      </div>
    </section>
  );
}

/**
 * 변경 내용은 자르지 않는다 — 학교가 무엇에서 무엇으로 바뀌었는지, 시트 동기화로 누가
 * 들어왔는지가 이 칸의 존재 이유다. 대신 한 줄에 안 들어갈 만큼 길면 접어 두고 버튼으로
 * 편다. 펼치면 ` · `로 이어 붙인 항목을 줄로 나눠 어느 필드가 몇 개 바뀌었는지 센다.
 */
const SUMMARY_CAP = 42;

function ChangeSummary({ action, summary }: { action: string; summary: string }) {
  const [open, setOpen] = useState(false);
  const long = summary.length > SUMMARY_CAP;
  const parts = summary.split(" · ");
  return (
    <>
      <span className="mr-2 inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{action}</span>
      {!long || !open ? <span>{long ? `${summary.slice(0, SUMMARY_CAP)}…` : summary}</span> : null}
      {long && open && (
        <ul className="mt-1.5 grid gap-1">
          {parts.map((part, index) => (
            <li key={`${index}-${part}`} className="flex gap-1.5">
              <span aria-hidden className="text-slate-300">·</span>
              <span className="min-w-0 break-words">{part}</span>
            </li>
          ))}
        </ul>
      )}
      {long && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className={`rounded px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-50 ${open ? "mt-1.5" : "ml-1"}`}
        >
          {open ? "접기" : `자세히 (${parts.length}건)`}
        </button>
      )}
    </>
  );
}

export function AdminChangesTab({ changes }: { changes: SundayAdminChange[] }) {
  return (
    <section className="card card-body">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="font-semibold text-slate-900">행정 변동 사항</h3><p className="mt-1 text-xs leading-5 text-slate-500">학생 출석부 관리자 화면에서 반영한 학생 등록·수정·삭제·이동 내역이 자동으로 기록됩니다.</p></div>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">총 {changes.length}건</span>
      </div>
      <div className="mt-4 space-y-3 sm:hidden" aria-label="행정 변동 사항 모바일 목록">
        {changes.map((change) => (
          <article key={`mobile:${change.year}:${change.classKey}:${change.id}`} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <strong className="text-slate-900">{change.studentName}</strong>
                <p className="mt-1 text-xs text-slate-500">{change.year}년 / {formatClassLabel(change.classKey)} / {change.teacher}</p>
              </div>
            </div>
            <div className="mt-4 text-sm leading-6 text-slate-700"><ChangeSummary action={change.action} summary={change.changeSummary} /></div>
            <div className="mt-4 flex items-end justify-between gap-3 border-t border-slate-100 pt-3 text-xs">
              <span className="text-slate-400">{formatDate(change.changedAt)}</span>
              <span className="text-right"><strong className="block text-emerald-700">{change.result}</strong><span className="mt-1 block text-slate-400">{change.actor}</span></span>
            </div>
          </article>
        ))}
        {changes.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">출석부 관리자 수정 기록이 없습니다.</div>}
      </div>
      <div className="mt-4 hidden max-h-[68vh] overflow-auto rounded-xl border border-slate-200 sm:block">
        <table className="w-full min-w-[1040px] border-collapse text-left text-xs">
          <caption className="sr-only">출석부 관리자 수정 날짜, 반, 담당 교사, 학생, 변경 내용과 반영 결과</caption>
          <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-semibold text-slate-500 shadow-[0_1px_0_#e2e8f0]">
            <tr><th className="min-w-36 px-3 py-3">수정 날짜</th><th className="min-w-32 px-3 py-3">반</th><th className="min-w-28 px-3 py-3">반담당 교사</th><th className="min-w-28 px-3 py-3">학생</th><th className="min-w-72 px-3 py-3">변경내용</th><th className="min-w-36 px-3 py-3">반영결과 / 담당</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {changes.map((change) => (
              <tr key={`${change.year}:${change.classKey}:${change.id}`} className="hover:bg-slate-50/80">
                <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-500">{formatDate(change.changedAt)}</td>
                <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-700">{change.year}년 · {formatClassLabel(change.classKey)}</td>
                <td className="px-3 py-3 text-slate-600">{change.teacher}</td>
                <td className="px-3 py-3 font-semibold text-slate-800">{change.studentName}</td>
                <td className="px-3 py-3 align-top leading-5 text-slate-700"><ChangeSummary action={change.action} summary={change.changeSummary} /></td>
                <td className="px-3 py-3"><span className="font-semibold text-emerald-700">{change.result}</span><span className="mt-1 block text-[11px] text-slate-400">{change.actor}</span></td>
              </tr>
            ))}
            {changes.length === 0 && <tr><td colSpan={6} className="py-14 text-center text-sm text-slate-400">출석부 관리자 수정 기록이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function nextAction(friend: SundayNewFriend) {
  if (!friend.week1Date) return "1주차 만남 기록";
  if (!friend.week2Date) return "2주차 만남 기록";
  if (friend.decision === "미정") return "등록 여부 결정";
  if (friend.decision === "등록" && !friend.assignedClassKey) return "반배정";
  if (!friend.rosterSync) return "학생 출석부 반영";
  return "완료 확인";
}
