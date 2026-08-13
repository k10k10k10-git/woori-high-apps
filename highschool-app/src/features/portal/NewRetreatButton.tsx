"use client";

// 수련회 생성 — 행정 목록(/retreats)과 이가드 센터(/field)가 같은 버튼·같은 폼을 쓴다.
// 수련회는 `retreats/{id}` 하나에만 저장되므로, 어느 쪽에서 만들어도 양쪽 목록에 함께 나타난다.
// 쓰기는 행정 db 모듈(@/lib/db)만 담당하고, 권한은 retreat-admin 수정 권한으로 게이트한다.

import { useEffect, useRef, useState } from "react";
import { useUI } from "@/context/UIContext";
import { createRetreat } from "@/lib/db";
import { parseSheetUrl } from "@/lib/sheetsParser";

type Props = {
  /** 생성 후 이동할 경로를 만든다 (행정은 /retreat/{id}, 이가드는 /retreat/{id}/field) */
  hrefAfterCreate: (retreatId: string) => string;
  onCreated?: (retreatId: string) => void | Promise<void>;
  className?: string;
};

export default function NewRetreatButton({ hrefAfterCreate, onCreated, className }: Props) {
  const { toast } = useUI();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", year: String(new Date().getFullYear()), sheetUrl: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [open]);

  const parsed = form.sheetUrl.trim() ? parseSheetUrl(form.sheetUrl) : null;

  async function submit() {
    const name = form.name.trim();
    const year = Number(form.year);
    if (!name) return toast("수련회 이름을 입력해주세요.", "warning");
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return toast("연도를 2000~2100 사이의 숫자로 입력해주세요.", "warning");
    }
    if (form.sheetUrl.trim() && !parsed) {
      setError("올바른 구글 시트 URL이 아닙니다.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const id = await createRetreat({
        name,
        year,
        sheetId: parsed?.sheetId ?? "",
        sheetGid: parsed?.sheetGid ?? "",
        createdAt: Date.now(),
        groupCount: 0,
      });
      setOpen(false);
      setForm({ name: "", year: String(new Date().getFullYear()), sheetUrl: "" });
      await onCreated?.(id);
      window.location.assign(hrefAfterCreate(id));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message.includes("PERMISSION_DENIED")
        ? "권한 없음: 수련회 생성은 행정 권한이 필요합니다."
        : `오류: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={className ?? "btn-primary"}>
        + 새 수련회
      </button>

      {open && (
        <div
          className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="새 수련회 만들기"
            tabIndex={-1}
            className="modal-card card w-full max-w-md p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="mb-4 text-lg font-bold text-slate-800">새 수련회 만들기</h3>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">수련회 이름 *</span>
                <input
                  className="input"
                  placeholder="2026 겨울 수련회"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">연도 *</span>
                <input
                  className="input"
                  type="number"
                  value={form.year}
                  onChange={(e) => setForm((p) => ({ ...p, year: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">
                  신청 응답 시트 URL <span className="text-xs font-normal text-slate-400">(선택, 나중에도 설정 가능)</span>
                </span>
                <input
                  className={`input ${form.sheetUrl && !parsed ? "border-red-400" : form.sheetUrl && parsed ? "border-green-400" : ""}`}
                  placeholder="https://docs.google.com/spreadsheets/…"
                  value={form.sheetUrl}
                  onChange={(e) => setForm((p) => ({ ...p, sheetUrl: e.target.value }))}
                />
                {form.sheetUrl && parsed && (
                  <span className="mt-1 block text-xs text-green-600">✅ 파싱 성공 - Sheet ID: <span className="font-mono">{parsed.sheetId.slice(0, 20)}…</span></span>
                )}
                {form.sheetUrl && !parsed && (
                  <span className="mt-1 block text-xs text-red-500">시트 URL 형식이 아닙니다.</span>
                )}
              </label>
            </div>
            {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
            <div className="mt-5 flex gap-2">
              <button onClick={() => setOpen(false)} className="btn-secondary flex-1 justify-center">취소</button>
              <button onClick={() => void submit()} disabled={saving} className="btn-primary flex-1 justify-center">
                {saving ? "만드는 중…" : "만들기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
