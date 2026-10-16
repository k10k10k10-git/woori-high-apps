"use client";

// 아카이브 — 학기 관련 외부 자료(문서·시트·드라이브·영상) 링크 보존. 유실 방지 1차 수단.

import { useEffect, useState } from "react";
import { useUI } from "@/context/UIContext";
import { addArchiveLink, removeArchiveLink, subscribeArchiveLinks } from "@/features/semester/db";
import { useSemesterCanEdit } from "@/features/semester/EditContext";
import { ArchiveLink } from "@/features/semester/types";
import { deleteSemesterArchiveFile, uploadSemesterArchiveFile } from "@/features/semester/archiveStorage";
import SaveFeedback from "@/components/SaveFeedback";
import { useSaveFeedback } from "@/features/semester/useSaveFeedback";
import { useSubmitLock } from "@/lib/useSubmitLock";

const KIND_LABEL: Record<ArchiveLink["kind"], string> = {
  doc: "📄 문서",
  sheet: "📊 시트",
  drive: "📁 드라이브",
  video: "🎬 영상",
  etc: "🔗 기타",
};

export default function ArchiveTab({ sid }: { sid: string }) {
  return <ArchiveEditor key={sid} sid={sid} />;
}

function ArchiveEditor({ sid }: { sid: string }) {
  const { toast, uiConfirm } = useUI();
  const canEdit = useSemesterCanEdit();
  const [links, setLinks] = useState<ArchiveLink[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<ArchiveLink["kind"]>("doc");
  const [mode, setMode] = useState<"file" | "link">("file");
  const [file, setFile] = useState<File | null>(null);
  const { busy: uploading, run } = useSubmitLock();
  const saveFeedback = useSaveFeedback(sid);
  const [progress, setProgress] = useState(0);

  useEffect(() => subscribeArchiveLinks(sid, setLinks, (e) => setLoadError(e.message)), [sid]);

  async function add() {
    if (!title.trim()) return;
    if (mode === "link" && !/^https?:\/\//.test(url.trim())) {
      toast("URL은 http(s)://로 시작해야 합니다", "warning");
      return;
    }
    if (mode === "file" && !file) return;
    setProgress(0);
    try {
      await saveFeedback.run("add", async () => {
        if (mode === "file" && file) {
          const uploaded = await uploadSemesterArchiveFile(sid, file, setProgress);
          await addArchiveLink(sid, {
            title: title.trim(),
            url: uploaded.fileUrl,
            kind,
            filePath: uploaded.filePath,
            fileName: file.name,
            fileSize: file.size,
          });
        } else {
          await addArchiveLink(sid, { title: title.trim(), url: url.trim(), kind });
        }
      });
      setTitle("");
      setUrl("");
      setFile(null);
      setProgress(0);
      toast(mode === "file" ? "파일이 업로드되었습니다" : "링크가 추가되었습니다", "success");
    } catch (e) {
      toast(`추가 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  return (
    <div>
      {loadError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          ⚠ 로드 오류: {loadError}
        </div>
      )}

      {canEdit && <div className="card card-body mb-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-800">자료 보관</h3>
            <p className="mt-0.5 text-xs text-slate-400">파일을 직접 올리거나 기존 드라이브·문서 링크를 연결합니다.</p>
          </div>
          <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-semibold">
            <button disabled={uploading} onClick={() => { setMode("file"); saveFeedback.reset("add"); }} className={`rounded-lg px-3 py-1.5 ${mode === "file" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"}`}>파일 업로드</button>
            <button disabled={uploading} onClick={() => { setMode("link"); saveFeedback.reset("add"); }} className={`rounded-lg px-3 py-1.5 ${mode === "link" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"}`}>링크 연결</button>
          </div>
        </div>
        <fieldset disabled={uploading} className="grid gap-2 sm:grid-cols-[auto_1fr_1.2fr_auto]">
          <select
            aria-label="자료 종류"
            value={kind}
            onChange={(e) => { setKind(e.target.value as ArchiveLink["kind"]); saveFeedback.markDirty("add"); }}
            className="input w-auto text-sm"
          >
            {Object.entries(KIND_LABEL).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          <input
            aria-label="자료 제목"
            value={title}
            onChange={(e) => { setTitle(e.target.value); saveFeedback.markDirty("add"); }}
            placeholder="자료 제목"
            className="input flex-1 text-sm"
          />
          {mode === "link" ? <input
            aria-label="자료 링크"
            value={url}
            onChange={(e) => { setUrl(e.target.value); saveFeedback.markDirty("add"); }}
            placeholder="https://…"
            className="input flex-1 text-sm"
          /> : <label className="input flex cursor-pointer items-center text-sm text-slate-500">
            <input
              type="file"
              className="sr-only"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null;
                setFile(nextFile);
                saveFeedback.markDirty("add");
                if (nextFile && !title.trim()) setTitle(nextFile.name.replace(/\.[^.]+$/, ""));
              }}
            />
            <span className="truncate">{file?.name ?? "파일 선택 (최대 30MB)"}</span>
          </label>}
          <button
            onClick={() => void run(add)}
            disabled={uploading || !title.trim() || (mode === "file" ? !file : !url.trim())}
            className="btn-primary justify-center"
          >
            {uploading ? mode === "file" && progress < 100 ? `업로드 중 ${progress}%` : "저장 중…" : mode === "file" ? "파일 저장" : "링크 저장"}
          </button>
        </fieldset>
        <SaveFeedback state={saveFeedback.state} idleLabel={mode === "file" ? "파일 저장을 누르면 업로드됩니다" : "링크 저장을 누르면 저장됩니다"} dirtyLabel={mode === "file" ? "미저장 · 파일 저장을 눌러 주세요" : "미저장 · 링크 저장을 눌러 주세요"} />
      </div>}

      <ul className="grid sm:grid-cols-2 gap-2">
        {links.map((l) => (
          <li key={l.id} className="card flex items-center gap-2 p-3">
            <a href={l.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 hover:underline">
              <div className="text-sm font-medium truncate">{l.title}</div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                <span>{KIND_LABEL[l.kind]}</span>
                {l.fileName && <span className="truncate">{l.fileName}</span>}
                {l.fileSize && <span>{Math.max(1, Math.round(l.fileSize / 1024))}KB</span>}
              </div>
            </a>
            {canEdit && <button
              aria-label={`${l.title} 삭제`}
              onClick={async () => {
                if (await uiConfirm(`'${l.title}' 자료를 삭제할까요?`)) {
                  if (l.filePath) await deleteSemesterArchiveFile(l.filePath);
                  await removeArchiveLink(sid, l.id);
                }
              }}
              className="text-xs text-slate-300 hover:text-red-500"
            >
              ✕
            </button>}
          </li>
        ))}
        {links.length === 0 && <p className="col-span-full rounded-2xl border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-400">아직 보관된 자료가 없습니다. 파일을 올리거나 기존 시트·문서·폴더 링크를 연결해주세요.</p>}
      </ul>
    </div>
  );
}
