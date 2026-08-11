import { deriveNewFriendStage } from "@/features/semester/newFriend";
import type { NewFriend, NewFriendPrivate } from "@/features/semester/types";

type Props = {
  friends: NewFriend[];
  privateMap: Record<string, NewFriendPrivate>;
  showPrivate: boolean;
  onOpenNewFriends: () => void;
};

const formatDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(date);
};

export function StudentChangesTab({ friends }: Pick<Props, "friends">) {
  const synced = friends
    .filter((friend) => friend.rosterSync)
    .sort((a, b) => (b.rosterSync?.syncedAt ?? "").localeCompare(a.rosterSync?.syncedAt ?? ""));

  return (
    <section className="card card-body">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">학생 변동 현황</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">새친구 등록으로 학생 출석부 원장에 반영된 신규 학생 변동을 모아봅니다.</p>
        </div>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">신규 등록 {synced.length}건</span>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead><tr className="border-b border-slate-200 text-slate-400"><th className="px-3 py-2">학생</th><th className="px-3 py-2">변동 유형</th><th className="px-3 py-2">반영 위치</th><th className="px-3 py-2">처리 시각</th></tr></thead>
          <tbody>
            {synced.map((friend) => <tr key={friend.id} className="border-b border-slate-100"><td className="px-3 py-3 font-semibold text-slate-800">{friend.name}</td><td className="px-3 py-3 text-slate-600">새친구 신규 등록</td><td className="px-3 py-3 text-slate-600">{friend.rosterSync?.classKey}</td><td className="px-3 py-3 text-slate-500">{formatDate(friend.rosterSync?.syncedAt)}</td></tr>)}
          </tbody>
        </table>
        {synced.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">출석부에 반영된 학생 변동이 없습니다.</div>}
      </div>
    </section>
  );
}

export function PendingTab({ friends, privateMap, showPrivate, onOpenNewFriends }: Props) {
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
          const priv = privateMap[friend.id];
          return <article key={friend.id} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><strong className="text-slate-900">{friend.name}</strong><span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700">{stage}</span></div><p className="mt-2 text-xs text-slate-500">{friend.part} · {friend.grade}학년 · 담당 {friend.owner || "미배정"}</p>{showPrivate && <p className="mt-2 text-xs text-slate-500">연락처 {priv?.phone || "—"}</p>}<p className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-400">다음 확인: {nextAction(friend)}</p></article>;
        })}
        {pending.length === 0 && <div className="col-span-full rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">처리 대기 중인 새친구가 없습니다.</div>}
      </div>
    </section>
  );
}

export function ChangeHistoryTab({ friends }: Pick<Props, "friends">) {
  const history = friends
    .flatMap((friend) => [
      { id: `${friend.id}:created`, name: friend.name, action: "새친구 접수", at: friend.createdAt },
      ...(friend.updatedAt && friend.updatedAt !== friend.createdAt ? [{ id: `${friend.id}:updated`, name: friend.name, action: "새친구 정보 수정", at: friend.updatedAt }] : []),
      ...(friend.rosterSync ? [{ id: `${friend.id}:sync`, name: friend.name, action: `학생 출석부 반영 · ${friend.rosterSync.classKey}`, at: friend.rosterSync.syncedAt }] : []),
    ])
    .sort((a, b) => b.at.localeCompare(a.at));

  return (
    <section className="card card-body">
      <div><h3 className="font-semibold text-slate-900">변경 이력</h3><p className="mt-1 text-xs leading-5 text-slate-500">새친구 접수·수정과 학생 출석부 반영 시각을 최신순으로 확인합니다.</p></div>
      <ol className="mt-4 divide-y divide-slate-100">
        {history.map((item) => <li key={item.id} className="flex gap-3 py-3"><span className="mt-1 size-2 shrink-0 rounded-full bg-emerald-500"/><div className="min-w-0 flex-1"><p className="text-sm text-slate-800"><strong>{item.name}</strong> · {item.action}</p><p className="mt-1 text-[11px] text-slate-400">{formatDate(item.at)}</p></div></li>)}
      </ol>
      {history.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">표시할 변경 이력이 없습니다.</div>}
    </section>
  );
}

function nextAction(friend: NewFriend) {
  if (!friend.week1Date) return "1주차 만남 기록";
  if (!friend.week2Date) return "2주차 만남 기록";
  if (friend.decision === "미정") return "등록 여부 결정";
  if (friend.decision === "등록" && !friend.assignedClassKey) return "반배정";
  if (!friend.rosterSync) return "학생 출석부 반영";
  if (!friend.giftDate) return "등반 확인·선물 전달";
  return "완료 확인";
}
