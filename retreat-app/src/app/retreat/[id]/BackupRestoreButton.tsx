"use client";
import { useState } from "react";
import { useUI } from "@/context/UIContext";

/**
 * 롤링 백업 복구 버튼 — 조편성/방배정처럼 전체 덮어쓰기로 저장되는 노드의 복구 진입점.
 * Firebase 접근은 부모가 넘겨주는 db.ts 함수(loadBackups/restore)로만 한다(직접 import 금지 규칙 준수).
 */
export default function BackupRestoreButton({ label, loadBackups, restore, disabled }: {
  label: string;
  loadBackups: () => Promise<Record<string, unknown>>;
  restore: (key: string) => Promise<void>;
  disabled?: boolean;
}) {
  const { toast, uiConfirm } = useUI();
  const [open, setOpen] = useState(false);
  const [keys, setKeys] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function openPicker() {
    setOpen(true);
    setKeys(null);
    try {
      const b = await loadBackups();
      setKeys(Object.keys(b).sort((a, z) => Number(z) - Number(a)));
    } catch (e) {
      toast(`백업을 불러오지 못했습니다: ${e instanceof Error ? e.message : String(e)}`, "error");
      setOpen(false);
    }
  }

  async function doRestore(key: string) {
    const when = new Date(Number(key)).toLocaleString("ko-KR");
    if (!await uiConfirm(`${when} 시점으로 되돌립니다.\n현재 내용은 복구 직전 상태로 다시 백업되니 안심하세요. 계속할까요?`)) return;
    setBusy(true);
    try {
      await restore(key);
      toast("복구했습니다.", "success");
      setOpen(false);
    } catch (e) {
      toast(`복구 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button onClick={openPicker} disabled={disabled} className="btn-secondary btn-sm" aria-label={`${label} 복구`}>⟲ 복구</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={`${label} 복구`} onClick={() => !busy && setOpen(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-800">{label} 복구</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600" aria-label="닫기">×</button>
            </div>
            <p className="text-xs text-slate-500 mb-3">최근 저장 시점의 자동 스냅샷입니다. 되돌릴 시점을 선택하세요.</p>
            {keys === null ? (
              <div className="py-6 text-center text-sm text-slate-400">불러오는 중…</div>
            ) : keys.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-400">저장된 백업이 없습니다.</div>
            ) : (
              <ul className="space-y-1.5 max-h-72 overflow-y-auto">
                {keys.map((k, i) => (
                  <li key={k}>
                    <button onClick={() => doRestore(k)} disabled={busy}
                      className="w-full text-left px-3 py-2 rounded-md border border-slate-200 hover:bg-slate-50 text-sm text-slate-700 disabled:opacity-50">
                      {new Date(Number(k)).toLocaleString("ko-KR")}
                      {i === 0 && <span className="ml-2 text-xs text-slate-400">· 가장 최근</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
