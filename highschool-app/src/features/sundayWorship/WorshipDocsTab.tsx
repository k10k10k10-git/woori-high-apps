"use client";

import { useEffect, useMemo, useState } from "react";
import { escapeHtml, printAsPDF } from "@/lib/exportUtils";
import { useLoadErrors } from "@/lib/useLoadErrors";
import { saveWorshipDoc, subscribeToWorshipDocs } from "./db";
import { DEFAULT_WORSHIP_DOCS, applyDocOverrides, type WorshipDoc } from "./worshipContent";

const BODY_TEXTAREA: React.CSSProperties = { height: 320, minHeight: 320, fontSize: 14, lineHeight: 1.8, resize: "vertical" };

export default function WorshipDocsTab({ canEdit }: { canEdit: boolean }) {
  const [overrides, setOverrides] = useState<Record<string, WorshipDoc>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<WorshipDoc | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { fail, ok, message: loadError } = useLoadErrors("worship-docs");

  useEffect(() => {
    const unsubscribe = subscribeToWorshipDocs((value) => { setOverrides(value); ok("예배 자료"); }, fail("예배 자료"));
    return () => unsubscribe();
  }, [fail, ok]);

  const docs = useMemo(() => applyDocOverrides(DEFAULT_WORSHIP_DOCS, overrides), [overrides]);

  const startEdit = (doc: WorshipDoc) => { setDraft({ ...doc }); setOpenId(doc.id); setNotice(null); };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setActionError(null);
    try {
      await saveWorshipDoc({ ...draft, title: draft.title.trim() || "제목 없음" });
      setDraft(null);
      setNotice("저장했습니다.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const print = (doc: WorshipDoc) => {
    const html = `<h1>${escapeHtml(doc.title)}</h1>
      <div style="white-space:pre-wrap;line-height:1.8;font-size:13px">${escapeHtml(doc.body)}</div>`;
    if (!printAsPDF(html, doc.title, false)) {
      setActionError("인쇄 창이 차단됐습니다. 브라우저의 팝업 차단을 해제해주세요.");
    }
  };

  const copy = async (doc: WorshipDoc) => {
    try {
      await navigator.clipboard.writeText(doc.body);
      setNotice("본문을 복사했습니다.");
    } catch {
      setActionError("복사에 실패했습니다. 본문을 직접 선택해 복사해주세요.");
    }
  };

  return (
    <section className="card card-body">
      {loadError && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">⚠ 로드 오류: {loadError}</div>}
      {actionError && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError}</div>}
      {notice && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700" aria-live="polite">{notice}</div>}

      <p className="text-xs text-slate-500">사진으로 돌리던 양식을 글로 둡니다. 복사와 인쇄가 되고 문구도 이 자리에서 고칠 수 있습니다.</p>

      <div className="mt-4 flex flex-col gap-3">
        {docs.map((doc) => {
          const open = openId === doc.id;
          const editing = draft?.id === doc.id;
          return (
            <article key={doc.id} className="rounded-xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
                <button type="button" className="min-w-0 flex-1 text-left" aria-expanded={open}
                  onClick={() => { setOpenId(open ? null : doc.id); if (open) setDraft(null); }}>
                  <strong className="text-sm text-slate-800">{doc.title}</strong>
                  <span className="ml-2 text-[11px] text-slate-400">{open ? "접기" : "펼치기"}</span>
                </button>
                <button type="button" className="btn-secondary text-xs" onClick={() => void copy(doc)}>본문 복사</button>
                <button type="button" className="btn-secondary text-xs" onClick={() => print(doc)}>PDF 인쇄</button>
                {canEdit && !editing && (
                  <button type="button" className="btn-secondary text-xs" onClick={() => startEdit(doc)}>수정</button>
                )}
              </div>

              {open && !editing && (
                <pre className="whitespace-pre-wrap break-words p-4 text-sm leading-7 text-slate-700">{doc.body}</pre>
              )}

              {editing && draft && (
                <div className="flex flex-col gap-3 p-4">
                  <div>
                    <label htmlFor={`doc-title-${doc.id}`} className="mb-1 block text-xs font-semibold text-slate-500">제목</label>
                    <input id={`doc-title-${doc.id}`} className="input text-sm" value={draft.title}
                      onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
                  </div>
                  <div>
                    <label htmlFor={`doc-body-${doc.id}`} className="mb-1 block text-xs font-semibold text-slate-500">본문</label>
                    {/* .input은 @layer 밖이라 높이·글꼴 유틸리티를 이긴다. 인라인 style로만 눌린다. */}
                    <textarea id={`doc-body-${doc.id}`} className="input" style={BODY_TEXTAREA} value={draft.body}
                      onChange={(event) => setDraft({ ...draft, body: event.target.value })} />
                    <p className="mt-1 text-[11px] text-slate-400">{draft.body.length}자</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="btn-primary" onClick={() => void save()} disabled={saving}>
                      {saving ? "저장 중…" : "저장"}
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => setDraft(null)} disabled={saving}>취소</button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
