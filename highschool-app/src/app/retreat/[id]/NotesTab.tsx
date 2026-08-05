"use client";
import { useCallback, useEffect, useState, useMemo } from "react";
import { Retreat, Participant } from "@/lib/types";
import { getParticipants, updateParticipantExtra } from "@/lib/db";
import { useUI } from "@/context/UIContext";

interface Props { retreat: Retreat; }

const CATEGORIES = ["건강/알레르기", "이동/카풀", "부분참", "기타"] as const;
type Category = typeof CATEGORIES[number];

const CAT_COLORS: Record<Category, string> = {
  "건강/알레르기": "tag-red",
  "이동/카풀": "tag-purple",
  "부분참": "tag-blue",
  "기타": "tag-yellow",
};

export default function NotesTab({ retreat }: Props) {
  const { toast } = useUI();
  const [participants, setParticipants] = useState<Record<string, Participant>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");
  const [editCategory, setEditCategory] = useState<Category>("기타");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [buFilter, setBuFilter] = useState("전체");
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const parts = await getParticipants(retreat.id);
      setParticipants(parts);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [retreat.id]);

  useEffect(() => { void load(); }, [load]);

  async function handleSaveNote() {
    if (!editKey) return;
    setSaving(true);
    try {
      const extraValue = editNote ? `[${editCategory}] ${editNote}` : undefined;
      await updateParticipantExtra(retreat.id, editKey, extraValue);
      setParticipants(prev => ({
        ...prev,
        [editKey]: { ...prev[editKey], extra: extraValue },
      }));
      setEditKey(null);
      setEditNote("");
    } catch (e) {
      toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(key: string, p: Participant) {
    const existing = p.extra || "";
    const catMatch = existing.match(/^\[(.+?)\] /);
    if (catMatch && CATEGORIES.includes(catMatch[1] as Category)) {
      setEditCategory(catMatch[1] as Category);
      setEditNote(existing.replace(/^\[.+?\] /, ""));
    } else {
      setEditCategory("기타");
      setEditNote(existing);
    }
    setEditKey(key);
  }

  const allList = useMemo(() => {
    return Object.entries(participants)
      .map(([key, p]) => ({ key, ...p }))
      .filter(p => {
        if (buFilter !== "전체" && p.bu !== buFilter) return false;
        if (search && !p.name.includes(search)) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.bu !== b.bu) return a.bu < b.bu ? -1 : 1;
        if (a.grade !== b.grade) return a.grade - b.grade;
        return a.class - b.class;
      });
  }, [participants, buFilter, search]);

  const withNotes = allList.filter(p => p.extra);
  const displayList = showAll ? allList : withNotes;

  const notesCount = Object.values(participants).filter(p => p.extra).length;

  if (loading) return <div className="text-center text-slate-400 py-10">로딩 중...</div>;

  return (
    <div>
      {loadError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          ⚠ 로드 오류: {loadError}
        </div>
      )}
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2 text-sm mr-1">
          <span className="text-slate-500">전체 <strong className="text-slate-800">{Object.keys(participants).length}</strong></span>
          <span className="text-slate-300">·</span>
          <span className="text-slate-500">특이사항 <strong className="text-red-600">{notesCount}</strong></span>
        </div>
        <input className="input" style={{ width: 160 }} placeholder="이름 검색" value={search}
          onChange={e => setSearch(e.target.value)} />
        <div className="flex gap-1">
          {["전체", "1부", "2부"].map(f => (
            <button key={f} onClick={() => setBuFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                buFilter === f ? "bg-sky-600 text-white border-sky-600" : "border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}>{f}</button>
          ))}
        </div>
        <button onClick={() => setShowAll(!showAll)}
          className={`btn-sm ${showAll ? "btn-primary" : "btn-secondary"}`}>
          {showAll ? "특이사항만 보기" : "전체 보기"}
        </button>
        <span className="text-xs text-slate-400 ml-auto">
          이름을 클릭해 특이사항을 추가/수정하세요
        </span>
      </div>

      {/* Edit Modal */}
      {editKey && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-lg mb-1">특이사항 입력</h3>
            <p className="text-sm text-slate-500 mb-4">
              {participants[editKey]?.name} · {participants[editKey]?.grade}학년 {participants[editKey]?.class}반
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => setEditCategory(cat)}
                    className={`py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      editCategory === cat ? "bg-blue-100 border-blue-400 text-blue-700" : "border-slate-200 text-slate-500"
                    }`}>
                    {cat}
                  </button>
                ))}
              </div>
              <textarea className="input min-h-[100px] resize-none" placeholder="특이사항 내용 (예: 아목사실린 항생제 알레르기, 인슐린 냉장보관 필요...)"
                value={editNote} onChange={e => setEditNote(e.target.value)} />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handleSaveNote} disabled={saving}
                className="btn-primary flex-1 justify-center">{saving ? "저장 중..." : "저장"}</button>
              <button onClick={() => { setEditKey(null); setEditNote(""); }}
                className="btn-secondary flex-1 justify-center">취소</button>
            </div>
            {participants[editKey]?.extra && (
              <button onClick={async () => {
                if (!editKey) return;
                setSaving(true);
                try {
                  await updateParticipantExtra(retreat.id, editKey, undefined);
                  setParticipants(prev => ({
                    ...prev,
                    [editKey]: { ...prev[editKey], extra: undefined },
                  }));
                  setEditKey(null);
                } catch (e) {
                  toast(`삭제 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
                } finally {
                  setSaving(false);
                }
              }} className="mt-2 w-full text-xs text-red-400 hover:text-red-600 text-center py-1">
                특이사항 삭제
              </button>
            )}
          </div>
        </div>
      )}

      {/* List */}
      <div className="card overflow-x-auto">
        {displayList.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            {showAll ? "참가자가 없습니다." : "특이사항이 있는 참가자가 없습니다."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="px-4 py-2.5 text-left whitespace-nowrap">이름</th>
                <th className="px-4 py-2.5 text-left whitespace-nowrap">부</th>
                <th className="px-4 py-2.5 text-left whitespace-nowrap">학년/반</th>
                <th className="px-4 py-2.5 text-left">특이사항</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayList.map(p => {
                const catMatch = p.extra?.match(/^\[(.+?)\] /);
                const category = catMatch?.[1] as Category | undefined;
                const noteText = p.extra?.replace(/^\[.+?\] /, "") || "";
                return (
                  <tr key={p.key} className={`hover:bg-slate-50 ${p.extra ? "bg-red-50/30" : ""}`}>
                    <td className="px-4 py-2.5 font-medium text-slate-800 whitespace-nowrap">{p.name}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`tag ${p.bu === "1부" ? "tag-green" : "tag-purple"}`}>{p.bu}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{p.grade}학년 {p.class}반</td>
                    <td className="px-4 py-2.5">
                      {p.extra ? (
                        <div className="flex items-start gap-2">
                          {category && CATEGORIES.includes(category) && (
                            <span className={`tag ${CAT_COLORS[category]} text-[10px] mt-0.5 shrink-0`}>{category}</span>
                          )}
                          <span className="text-slate-700 text-xs">{noteText || p.extra}</span>
                        </div>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => startEdit(p.key, p)}
                        className="text-xs text-slate-400 hover:text-blue-500 whitespace-nowrap">
                        {p.extra ? "수정" : "추가"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
