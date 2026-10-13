"use client";
import { useMemo, useState } from "react";
import { IguardPost } from "@/features/iguard/lib/types";
import { saveIguardPost, deleteIguardPost, updateIguardPostFields } from "@/features/iguard/lib/db";
import { useUI } from "@/context/UIContext";

export default function PostsView({ retreatId, posts }: { retreatId: string; posts: IguardPost[] }) {
  const { toast, uiConfirm } = useUI();
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { name: string; area: string }>>({});

  // drafts에는 사용자가 실제로 고친 항목만 담고, 나머지는 렌더 중 서버 값에서 파생한다.
  // 예전처럼 effect로 posts 전체를 draft에 복사하면 실시간 갱신이 입력 중인 값을 덮었다.
  const draftFor = (post: IguardPost) => drafts[post.id] ?? { name: post.name, area: post.area || "" };

  const changedCount = useMemo(() => posts.filter(post => {
    const draft = drafts[post.id];
    return !!draft && (draft.name.trim() !== post.name || draft.area.trim() !== (post.area || ""));
  }).length, [drafts, posts]);

  async function add() {
    if (!name.trim()) return toast("상세구역 이름을 입력해주세요.", "warning");
    try { await saveIguardPost(retreatId, { name: name.trim(), area: area.trim() || undefined }); setName(""); }
    catch (e) { toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error"); }
  }
  async function del(p: IguardPost) {
    if (!await uiConfirm(`"${p.name}" 상세구역을 삭제할까요?`)) return;
    try { await deleteIguardPost(retreatId, p.id); } catch (e) { toast(`삭제 오류: ${e}`, "error"); }
  }
  async function saveAll() {
    const changes: Record<string, Partial<Pick<IguardPost, "name" | "area">>> = {};
    for (const post of posts) {
      const draft = draftFor(post);
      if (!draft.name.trim()) return toast("포스트 이름은 비워둘 수 없습니다.", "warning");
      const fields: Partial<Pick<IguardPost, "name" | "area">> = {};
      if (draft.name.trim() !== post.name) fields.name = draft.name.trim();
      if (draft.area.trim() !== (post.area || "")) fields.area = draft.area.trim();
      if (Object.keys(fields).length > 0) changes[post.id] = fields;
    }
    try {
      await updateIguardPostFields(retreatId, changes);
      toast(`${Object.keys(changes).length}개 포스트를 저장했습니다.`, "success");
    } catch (error) { toast(`저장 오류: ${error instanceof Error ? error.message : String(error)}`, "error"); }
  }

  return (
    <div>
      <section className="card overflow-hidden">
        <div className="grid grid-cols-[minmax(120px,0.35fr)_minmax(220px,1fr)_auto] gap-2 border-b border-slate-200 bg-slate-900 px-3 py-2 text-xs font-semibold text-white">
          <span>구역</span><span>포스트</span><span className="w-14 text-center">관리</span>
        </div>
        {posts.map(post => (
          <div key={post.id} className="grid grid-cols-[minmax(120px,0.35fr)_minmax(220px,1fr)_auto] items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0">
            <input
              aria-label={`${post.name} 구역`}
              className="input min-h-10 text-sm"
              value={draftFor(post).area}
              onChange={event => setDrafts(current => ({
                ...current,
                [post.id]: { ...draftFor(post), area: event.target.value },
              }))}
              placeholder="예: 4층, 식당"
            />
            <input
              aria-label={`${post.name} 이름`}
              className="input min-h-10 min-w-0 text-sm"
              value={draftFor(post).name}
              onChange={event => setDrafts(current => ({
                ...current,
                [post.id]: { ...draftFor(post), name: event.target.value },
              }))}
              placeholder="예: 강당 엘리베이터 앞"
            />
            <button onClick={() => del(post)} className="min-h-10 w-14 text-xs text-slate-400 hover:text-red-500">삭제</button>
          </div>
        ))}
        <div className="grid grid-cols-[minmax(120px,0.35fr)_minmax(220px,1fr)_auto] items-center gap-2 bg-slate-50 px-3 py-3">
          <input className="input min-h-10 text-sm" placeholder="새 구역" value={area}
          onChange={e => setArea(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} />
          <input className="input min-h-10 min-w-0 text-sm" placeholder="새 포스트 이름" value={name}
          onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} />
          <button onClick={add} className="btn-secondary min-h-10 w-14 px-1 text-xs">추가</button>
        </div>
      </section>
      <div className="sticky bottom-3 mt-3 flex justify-end">
        <button onClick={saveAll} disabled={changedCount === 0} className="btn-primary min-h-11 shadow-lg disabled:opacity-50">
          {changedCount > 0 ? `변경 ${changedCount}개 저장` : "모두 저장됨"}
        </button>
      </div>
    </div>
  );
}
