"use client";
import { useEffect, useMemo, useState } from "react";
import { IguardPost } from "@/lib/types";
import { saveIguardPost, deleteIguardPost, updateIguardPostFields } from "@/lib/db";
import { useUI } from "@/context/UIContext";

export default function PostsView({ retreatId, posts }: { retreatId: string; posts: IguardPost[] }) {
  const { toast, uiConfirm } = useUI();
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { name: string; area: string }>>({});

  useEffect(() => {
    setDrafts(Object.fromEntries(posts.map(post => [post.id, { name: post.name, area: post.area || "" }])));
  }, [posts]);

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
      const draft = drafts[post.id];
      if (!draft) continue;
      if (!draft.name.trim()) return toast("포스트 이름은 비워둘 수 없습니다.", "warning");
      const fields: Partial<Pick<IguardPost, "name" | "area">> = {};
      if (draft.name.trim() !== post.name) fields.name = draft.name.trim();
      if (draft.area.trim() !== (post.area || "")) fields.area = draft.area.trim();
      if (Object.keys(fields).length > 0) changes[post.id] = fields;
    }
    try {
      await updateIguardPostFields(retreatId, changes);
      setEditing(false);
      toast(`${Object.keys(changes).length}개 포스트를 저장했습니다.`, "success");
    } catch (error) { toast(`저장 오류: ${error instanceof Error ? error.message : String(error)}`, "error"); }
  }

  const areas = [...new Set(posts.map(p => p.area || "(구역 미지정)"))];

  return (
    <div>
      <div className="mb-4 bg-violet-50 border border-violet-100 rounded-lg p-3 text-xs text-violet-700">
        ℹ️ 건물별 통제 지점(층장·계단앞·엘베앞·배식구·퇴식구·화장실·문단속 등). 사람이 건물을 보고 직접 정의합니다. 동선 매트릭스에서 스탭에게 배정됩니다.
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <input className="input max-w-[140px]" placeholder="장소 (예: 4층, 식당)" value={area}
          onChange={e => setArea(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} />
        <input className="input max-w-[200px]" placeholder="상세구역 (예: 강당 엘베 앞)" value={name}
          onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} />
        <button onClick={add} className="btn-primary">＋ 추가</button>
        {posts.length > 0 && (
          editing ? (
            <>
              <button onClick={saveAll} disabled={changedCount === 0} className="btn-primary disabled:opacity-50">변경 {changedCount}개 저장</button>
              <button onClick={() => { setEditing(false); setDrafts(Object.fromEntries(posts.map(post => [post.id, { name: post.name, area: post.area || "" }]))); }} className="btn-secondary">취소</button>
            </>
          ) : <button onClick={() => setEditing(true)} className="btn-secondary">여러 포스트 수정</button>
        )}
      </div>
      {posts.length === 0 ? (
        <div className="card p-8 text-center text-slate-400"><div className="text-3xl mb-2">📍</div><p>등록된 포스트가 없습니다.</p></div>
      ) : (
        <div className="space-y-3">
          {areas.map(area => (
            <div key={area} className="card overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-sm font-semibold text-slate-600">{area}</div>
              <ul className="divide-y divide-slate-100">
                {posts.filter(p => (p.area || "(구역 미지정)") === area).map(p => (
                  <li key={p.id} className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50">
                    {editing ? (
                      <>
                        <input className="input max-w-[160px] text-sm" value={drafts[p.id]?.area || ""}
                          onChange={event => setDrafts(current => ({ ...current, [p.id]: { ...(current[p.id] || { name: p.name, area: "" }), area: event.target.value } }))} placeholder="구역" />
                        <input className="input min-w-0 flex-1 text-sm" value={drafts[p.id]?.name || ""}
                          onChange={event => setDrafts(current => ({ ...current, [p.id]: { ...(current[p.id] || { name: "", area: p.area || "" }), name: event.target.value } }))} placeholder="포스트 이름" />
                      </>
                    ) : <span className="text-sm text-slate-800">{p.name}</span>}
                    <button onClick={() => del(p)} className="ml-auto text-xs text-slate-300 hover:text-red-400">삭제</button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
