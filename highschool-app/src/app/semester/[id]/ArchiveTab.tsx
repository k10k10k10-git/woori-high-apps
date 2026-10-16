"use client";

// 아카이브 — 학기 관련 외부 자료(문서·시트·드라이브·영상) 링크 보존. 유실 방지 1차 수단.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUI } from "@/context/UIContext";
import { addArchiveLink, markArchiveLinkDeleting, removeArchiveLink, subscribeArchiveLinks } from "@/features/semester/db";
import { useSemesterCanEdit } from "@/features/semester/EditContext";
import { ArchiveLink } from "@/features/semester/types";
import { deleteSemesterArchiveFile, uploadSemesterArchiveFile } from "@/features/semester/archiveStorage";
import SaveFeedback from "@/components/SaveFeedback";
import { useSaveFeedback } from "@/features/semester/useSaveFeedback";
import { useSubmitLock } from "@/lib/useSubmitLock";
import LoadFailureNotice from "@/components/LoadFailureNotice";

const KIND_LABEL: Record<ArchiveLink["kind"], string> = {
  doc: "📄 문서",
  sheet: "📊 시트",
  drive: "📁 드라이브",
  video: "🎬 영상",
  etc: "🔗 기타",
};

export default function ArchiveTab({ sid, operationsBaseHref }: { sid: string; operationsBaseHref?: string }) {
  return <ArchiveEditor key={sid} sid={sid} operationsBaseHref={operationsBaseHref} />;
}

function ArchiveEditor({ sid, operationsBaseHref }: { sid: string; operationsBaseHref?: string }) {
  const { toast, uiConfirm } = useUI();
  const canEdit = useSemesterCanEdit();
  const [links, setLinks] = useState<ArchiveLink[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null);
  const { run: runDelete } = useSubmitLock();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<ArchiveLink["kind"]>("doc");
  const [mode, setMode] = useState<"file" | "link">("file");
  const [file, setFile] = useState<File | null>(null);
  const { busy: uploading, run } = useSubmitLock();
  const saveFeedback = useSaveFeedback(sid);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeArchiveLinks(sid, (next) => {
      if (active) { setLinks(next); setLoadError(false); }
    }, () => { if (active) setLoadError(true); });
    return () => { active = false; unsubscribe(); };
  }, [sid, retry]);

  async function remove(link: ArchiveLink) {
    if (!canEdit || loadError) return;
    if (!link.deletionPending && !(await uiConfirm(`'${link.title}' 자료를 삭제할까요?`))) return;
    setDeletingId(link.id);
    setDeleteError(null);
    try {
      // 파일 삭제 전에 진행 상태를 저장한다. 중단·새로고침 후에도 깨진 링크 대신 재시도를 제공한다.
      if (!(await markArchiveLinkDeleting(sid, link.id))) return;
      if (link.filePath) await deleteSemesterArchiveFile(link.filePath);
      await removeArchiveLink(sid, link.id);
      toast("자료를 삭제했습니다", "success");
    } catch {
      setDeleteError({ id: link.id, message: "자료 삭제를 완료하지 못했습니다. 삭제 다시 시도로 이어서 처리해 주세요." });
    } finally { setDeletingId(null); }
  }

  async function add() {
    if (!canEdit || loadError || !title.trim()) return;
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
    } catch {
      toast("자료를 저장하지 못했습니다. 입력은 유지되어 있으니 저장 버튼을 다시 눌러 주세요.", "error");
    }
  }

  return (
    <div>
      {loadError && (
        <LoadFailureNotice title="학기 자료를 불러오지 못했습니다" description="목록과 작성 중인 입력은 유지됩니다. 다시 불러온 뒤 자료를 저장하거나 삭제해 주세요." onRetry={() => setRetry((value) => value + 1)} />
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
        <fieldset disabled={uploading || loadError} className="grid gap-2 sm:grid-cols-[auto_1fr_1.2fr_auto]">
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
          <li key={l.id} className="card p-3">
            <div className="flex items-center gap-2">
            {l.deletionPending ? <div className="flex-1 min-w-0"><strong className="text-sm">{l.title}</strong><p className="text-sm text-slate-600">삭제 처리 중인 자료입니다.{canEdit ? " 삭제 다시 시도로 마무리할 수 있습니다." : " 담당자가 삭제를 마무리하고 있습니다."}</p></div> : <a href={l.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 hover:underline">
              <div className="text-sm font-medium truncate">{l.title}</div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                <span>{KIND_LABEL[l.kind]}</span>
                {l.fileName && <span className="truncate">{l.fileName}</span>}
                {l.fileSize && <span>{Math.max(1, Math.round(l.fileSize / 1024))}KB</span>}
              </div>
            </a>}
            {canEdit && <button
              aria-label={`${l.title} ${l.deletionPending || deleteError?.id === l.id ? "삭제 다시 시도" : "삭제"}`}
              disabled={deletingId !== null || loadError}
              onClick={() => void runDelete(() => remove(l))}
              className="btn-secondary text-sm"
            >
              {deletingId === l.id ? "삭제 중…" : l.deletionPending || deleteError?.id === l.id ? "삭제 다시 시도" : "삭제"}
            </button>}
            </div>
            {deleteError?.id === l.id && <p role="alert" className="mt-2 text-sm text-red-700">{deleteError.message}</p>}
          </li>
        ))}
        {!loadError && links.length === 0 && <li className="col-span-full rounded-2xl border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-600"><p>아직 보관된 자료가 없습니다. {canEdit ? "위에서 파일을 올리거나 기존 시트·문서·폴더 링크를 연결해 주세요." : operationsBaseHref ? "학기 운영 자료 보관에서 공용 자료를 등록할 수 있습니다." : "자료가 필요하면 담당 교역자 또는 행정팀에 학기 공용 자료 등록을 요청해 주세요."}</p>{!canEdit && operationsBaseHref && <Link className="btn-secondary mt-3" href={`${operationsBaseHref}/archive`}>학기 자료 등록하러 가기</Link>}</li>}
      </ul>
    </div>
  );
}
