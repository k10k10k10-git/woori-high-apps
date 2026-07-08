"use client";
import { useEffect, useRef, useState } from "react";
import { BrainstormNote } from "@/lib/types";
import {
  subscribeToBrainstormNotes, saveBrainstormNote, updateBrainstormNote, deleteBrainstormNote,
  addBrainstormComment, deleteBrainstormComment,
} from "@/lib/db";
import { useUI } from "@/context/UIContext";

interface Props {
  authorName: string;
}

// ── 가상 캔버스 크기 (모든 사용자 화면에서 좌표 일치) ──────────
const CANVAS_W = 1400;
const CANVAS_H = 760;
const CARD_W = 224;

// 스티키 노트 색상 팔레트 (Padlet 느낌의 파스텔톤)
const NOTE_COLORS: Record<string, { bg: string; border: string; accent: string }> = {
  yellow: { bg: "#fefce8", border: "#fde047", accent: "#facc15" },
  blue:   { bg: "#eff6ff", border: "#93c5fd", accent: "#60a5fa" },
  green:  { bg: "#f0fdf4", border: "#86efac", accent: "#4ade80" },
  pink:   { bg: "#fdf2f8", border: "#f9a8d4", accent: "#f472b6" },
  purple: { bg: "#faf5ff", border: "#d8b4fe", accent: "#c084fc" },
};
const COLOR_KEYS = Object.keys(NOTE_COLORS);

function clampX(x: number) { return Math.max(8, Math.min(x, CANVAS_W - CARD_W - 8)); }
function clampY(y: number) { return Math.max(8, Math.min(y, CANVAS_H - 120)); }

// 좌표 없는 노트(구버전 데이터)의 결정적 배치 — id 해시 기반이라 모든 화면에서 동일
function fallbackPos(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const a = Math.abs(h);
  return { x: clampX(40 + (a % (CANVAS_W - CARD_W - 100))), y: clampY(40 + ((a >> 7) % (CANVAS_H - 300))) };
}

function notePos(n: BrainstormNote) {
  if (typeof n.x === "number" && typeof n.y === "number") return { x: clampX(n.x), y: clampY(n.y) };
  return fallbackPos(n.id);
}

function formatTime(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

export default function BrainstormPanel({ authorName }: Props) {
  const { toast, uiConfirm } = useUI();
  const [notes, setNotes] = useState<BrainstormNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 새 카드 작성 (캔버스 위 지정 좌표에 composer 카드 표시)
  const [composerPos, setComposerPos] = useState<{ x: number; y: number } | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draft, setDraft] = useState("");
  const [draftColor, setDraftColor] = useState("yellow");
  const [saving, setSaving] = useState(false);

  // 카드 수정
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editText, setEditText] = useState("");

  // 댓글
  const [openCommentsId, setOpenCommentsId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");

  // 드래그
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number; moved: boolean; lastWrite: number } | null>(null);
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToBrainstormNotes(list => {
      // 최근에 만진 카드가 위에 오도록 (렌더 순서 = z 순서)
      setNotes([...list].sort((a, b) => (a.updatedAt ?? a.createdAt) - (b.updatedAt ?? b.createdAt)));
      setLoading(false);
    }, e => { setLoadError(prev => prev ?? `구독 실패 — ${e.message}`); setLoading(false); });
    return unsubscribe;
  }, []);

  // ── 새 카드 ──────────────────────────────────────────────
  function openComposerAt(x: number, y: number) {
    setDraftTitle("");
    setDraft("");
    setComposerPos({ x: clampX(x), y: clampY(y) });
    setEditId(null);
    setOpenCommentsId(null);
  }

  function handleCanvasDoubleClick(e: React.MouseEvent) {
    if (e.target !== canvasRef.current) return; // 카드 위 더블클릭은 무시
    const rect = canvasRef.current!.getBoundingClientRect();
    openComposerAt(e.clientX - rect.left - CARD_W / 2, e.clientY - rect.top - 20);
  }

  function handleAddButton() {
    // 버튼으로 추가 시: 카드 수 기반 계단식 배치
    const n = notes.length;
    openComposerAt(48 + (n % 8) * 36, 48 + (n % 6) * 32);
  }

  async function handleAdd() {
    const text = draft.trim();
    const title = draftTitle.trim();
    if (!text && !title) return toast("내용을 입력해주세요.", "warning");
    if (!composerPos) return;
    setSaving(true);
    try {
      await saveBrainstormNote({
        title: title || undefined, text, color: draftColor, author: authorName,
        createdAt: Date.now(), x: composerPos.x, y: composerPos.y,
      });
      setComposerPos(null);
    } catch (e) {
      toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setSaving(false);
    }
  }

  // ── 수정/삭제 ────────────────────────────────────────────
  async function handleSaveEdit(note: BrainstormNote) {
    const text = editText.trim();
    const title = editTitle.trim();
    if (!text && !title) return toast("내용을 입력해주세요.", "warning");
    try {
      await updateBrainstormNote(note.id, { title: title || undefined, text, updatedAt: Date.now() });
      setEditId(null);
    } catch (e) {
      toast(`수정 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  async function handleChangeColor(note: BrainstormNote, color: string) {
    try {
      await updateBrainstormNote(note.id, { color });
    } catch (e) {
      toast(`수정 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  async function handleDelete(id: string) {
    if (!await uiConfirm("이 카드를 삭제하시겠습니까?")) return;
    try {
      await deleteBrainstormNote(id);
    } catch (e) {
      toast(`삭제 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  // ── 댓글 ─────────────────────────────────────────────────
  async function handleAddComment(note: BrainstormNote) {
    const text = commentDraft.trim();
    if (!text) return;
    try {
      await addBrainstormComment(note.id, { author: authorName, text, createdAt: Date.now() });
      setCommentDraft("");
    } catch (e) {
      toast(`댓글 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  async function handleDeleteComment(noteId: string, commentId: string) {
    try {
      await deleteBrainstormComment(noteId, commentId);
    } catch (e) {
      toast(`삭제 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  // ── 드래그 (pointer events) ──────────────────────────────
  function handleCardPointerDown(e: React.PointerEvent, note: BrainstormNote) {
    // 버튼/입력요소 위에서 시작한 드래그는 무시, 수정/댓글 열림 상태도 무시
    const target = e.target as HTMLElement;
    if (target.closest("button, textarea, input, a")) return;
    if (editId === note.id) return;
    const pos = dragPos?.id === note.id ? dragPos : notePos(note);
    dragRef.current = {
      id: note.id,
      offsetX: e.clientX - pos.x,
      offsetY: e.clientY - pos.y,
      moved: false,
      lastWrite: 0,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handleCardPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const x = clampX(e.clientX - d.offsetX);
    const y = clampY(e.clientY - d.offsetY);
    d.moved = true;
    setDragPos({ id: d.id, x, y });
    // 드래그 중에도 다른 사용자 화면에 실시간 반영 (200ms 스로틀)
    const now = Date.now();
    if (now - d.lastWrite > 200) {
      d.lastWrite = now;
      void updateBrainstormNote(d.id, { x, y }).catch(() => {});
    }
  }

  async function handleCardPointerUp() {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (d.moved && dragPos && dragPos.id === d.id) {
      try {
        await updateBrainstormNote(d.id, { x: dragPos.x, y: dragPos.y, updatedAt: Date.now() });
      } catch (e) {
        toast(`이동 저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
      }
    }
    setDragPos(null);
  }

  // ── 카드 렌더 ────────────────────────────────────────────
  function renderColorPicker(current: string, onPick: (c: string) => void) {
    return (
      <div className="flex gap-1.5" role="radiogroup" aria-label="카드 색상">
        {COLOR_KEYS.map(c => (
          <button key={c} onClick={() => onPick(c)}
            role="radio" aria-checked={current === c} aria-label={`${c} 색상`}
            className="w-5 h-5 rounded-full transition-transform"
            style={{
              background: NOTE_COLORS[c].bg,
              border: `2px solid ${current === c ? "#475569" : NOTE_COLORS[c].border}`,
              transform: current === c ? "scale(1.15)" : "scale(1)",
            }} />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-6">
      {loadError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          ⚠ 로드 오류: {loadError}
        </div>
      )}
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-700">
            💡 브레인스토밍 <span className="text-xs font-normal text-slate-400">(공유 · 실시간)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5 truncate">
            팀 공용 아이디어 보드 — 카드를 드래그해 자유롭게 배치하고, 빈 곳을 더블클릭해 새 카드를 만드세요.
          </p>
        </div>
        <button onClick={handleAddButton} className="btn-primary text-xs px-3 py-1.5 shrink-0">
          ＋ 아이디어 추가
        </button>
      </div>

      {/* ── 캔버스 (가로 스크롤 가능) ── */}
      <div className="rounded-2xl overflow-auto shadow-sm" style={{ border: "1px solid #e2e8f0", maxHeight: 620 }}>
        <div
          ref={canvasRef}
          onDoubleClick={handleCanvasDoubleClick}
          className="relative"
          style={{
            width: CANVAS_W,
            height: CANVAS_H,
            background:
              "radial-gradient(circle at 1px 1px, rgba(99,102,241,0.16) 1.2px, transparent 0) 0 0/26px 26px, " +
              "linear-gradient(135deg, #eef2ff 0%, #e0f2fe 45%, #fdf4ff 100%)",
          }}
        >
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">로딩 중...</div>
          )}

          {!loading && notes.length === 0 && !composerPos && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 pointer-events-none">
              <div className="text-4xl mb-2">💡</div>
              <p className="text-sm font-medium">빈 곳을 더블클릭해 첫 아이디어를 남겨보세요!</p>
            </div>
          )}

          {/* ── 노트 카드들 ── */}
          {notes.map(note => {
            const pos = dragPos?.id === note.id ? dragPos : notePos(note);
            const c = NOTE_COLORS[note.color] ?? NOTE_COLORS.yellow;
            const isEditing = editId === note.id;
            const isDragging = dragPos?.id === note.id;
            const comments = Object.entries(note.comments ?? {})
              .map(([id, cm]) => ({ id, ...cm }))
              .sort((a, b) => a.createdAt - b.createdAt);
            const commentsOpen = openCommentsId === note.id;

            return (
              <div
                key={note.id}
                onPointerDown={e => handleCardPointerDown(e, note)}
                onPointerMove={handleCardPointerMove}
                onPointerUp={handleCardPointerUp}
                className="absolute rounded-xl select-none group"
                style={{
                  left: pos.x, top: pos.y, width: CARD_W,
                  background: c.bg,
                  border: `1px solid ${c.border}`,
                  borderTop: `4px solid ${c.accent}`,
                  boxShadow: isDragging ? "0 12px 28px rgba(15,23,42,0.22)" : "0 2px 8px rgba(15,23,42,0.08)",
                  transform: isDragging ? "scale(1.03)" : "scale(1)",
                  transition: isDragging ? "none" : "box-shadow .15s, transform .15s",
                  cursor: isEditing ? "default" : "grab",
                  touchAction: "none",
                  zIndex: isDragging ? 50 : undefined,
                }}
              >
                <div className="p-3">
                  {isEditing ? (
                    <>
                      <input
                        className="w-full bg-transparent outline-none text-sm font-bold text-slate-800 placeholder:text-slate-400 mb-1"
                        placeholder="제목 (선택)"
                        value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                        autoFocus
                        onKeyDown={e => { if (e.key === "Escape") setEditId(null); }}
                      />
                      <textarea
                        className="w-full bg-transparent resize-none outline-none text-sm text-slate-700 placeholder:text-slate-400"
                        rows={3}
                        placeholder="내용"
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        onKeyDown={e => { if (e.key === "Escape") setEditId(null); }}
                      />
                      <div className="flex items-center justify-between mt-2">
                        {renderColorPicker(note.color, cKey => handleChangeColor(note, cKey))}
                        <div className="flex gap-1.5">
                          <button onClick={() => handleSaveEdit(note)} className="text-xs font-semibold text-blue-600 hover:text-blue-700">저장</button>
                          <button onClick={() => setEditId(null)} className="text-xs text-slate-500 hover:text-slate-700">취소</button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {note.title && (
                        <h4 className="text-sm font-bold text-slate-800 mb-1 break-words">{note.title}</h4>
                      )}
                      <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{note.text}</p>
                      <div className="flex items-center justify-between mt-2.5">
                        <span className="text-[11px] text-slate-500 truncate">
                          {note.author} · {formatTime(note.updatedAt ?? note.createdAt)}
                        </span>
                        <div className="flex gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => { setEditId(note.id); setEditTitle(note.title ?? ""); setEditText(note.text); setComposerPos(null); }}
                            className="text-[11px] text-slate-500 hover:text-blue-600">수정</button>
                          <button onClick={() => handleDelete(note.id)}
                            className="text-[11px] text-slate-400 hover:text-red-500">삭제</button>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* ── 댓글 ── */}
                <div style={{ borderTop: `1px solid ${c.border}` }}>
                  <button
                    onClick={() => { setOpenCommentsId(commentsOpen ? null : note.id); setCommentDraft(""); }}
                    className="w-full text-left px-3 py-1.5 text-[11px] text-slate-500 hover:text-slate-700"
                  >
                    💬 댓글 {comments.length > 0 ? comments.length : ""} {commentsOpen ? "▾" : "▸"}
                  </button>
                  {commentsOpen && (
                    <div className="px-3 pb-2.5">
                      {comments.length > 0 && (
                        <div className="space-y-1.5 mb-2 max-h-32 overflow-y-auto">
                          {comments.map(cm => (
                            <div key={cm.id} className="flex items-start justify-between gap-1.5 group/cm">
                              <p className="text-[11px] text-slate-600 break-words min-w-0">
                                <span className="font-semibold text-slate-700">{cm.author}</span>{" "}
                                {cm.text}
                                <span className="text-slate-400 ml-1">{formatTime(cm.createdAt)}</span>
                              </p>
                              <button onClick={() => handleDeleteComment(note.id, cm.id)}
                                className="text-slate-300 hover:text-red-400 text-xs leading-none shrink-0 opacity-0 group-hover/cm:opacity-100"
                                aria-label="댓글 삭제">×</button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-1">
                        <input
                          className="flex-1 min-w-0 bg-white/70 rounded-md px-2 py-1 text-[11px] outline-none"
                          style={{ border: `1px solid ${c.border}` }}
                          placeholder="댓글 입력…"
                          value={commentDraft}
                          onChange={e => setCommentDraft(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") void handleAddComment(note); }}
                        />
                        <button onClick={() => handleAddComment(note)}
                          className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 shrink-0">등록</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* ── 새 카드 composer ── */}
          {composerPos && (
            <div
              className="absolute rounded-xl p-3"
              style={{
                left: composerPos.x, top: composerPos.y, width: CARD_W, zIndex: 60,
                background: NOTE_COLORS[draftColor].bg,
                border: `1px solid ${NOTE_COLORS[draftColor].border}`,
                borderTop: `4px solid ${NOTE_COLORS[draftColor].accent}`,
                boxShadow: "0 12px 28px rgba(15,23,42,0.22)",
              }}
            >
              <input
                className="w-full bg-transparent outline-none text-sm font-bold text-slate-800 placeholder:text-slate-400 mb-1"
                placeholder="제목 (선택)"
                value={draftTitle}
                onChange={e => setDraftTitle(e.target.value)}
                autoFocus
                onKeyDown={e => { if (e.key === "Escape") setComposerPos(null); }}
              />
              <textarea
                className="w-full bg-transparent resize-none outline-none text-sm text-slate-700 placeholder:text-slate-400"
                rows={3}
                placeholder="아이디어를 입력하세요…"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Escape") setComposerPos(null); }}
              />
              <div className="flex items-center justify-between mt-2">
                {renderColorPicker(draftColor, setDraftColor)}
                <div className="flex gap-1.5">
                  <button onClick={handleAdd} disabled={saving}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                    {saving ? "저장 중…" : "저장"}
                  </button>
                  <button onClick={() => setComposerPos(null)} className="text-xs text-slate-500 hover:text-slate-700">취소</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
