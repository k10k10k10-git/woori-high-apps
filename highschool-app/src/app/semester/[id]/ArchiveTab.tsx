"use client";

// 아카이브 — 학기 관련 외부 자료(문서·시트·드라이브·영상) 링크 보존. 유실 방지 1차 수단.

import { useEffect, useState } from "react";
import { useUI } from "@/context/UIContext";
import { addArchiveLink, removeArchiveLink, subscribeArchiveLinks } from "@/features/semester/db";
import { ArchiveLink } from "@/features/semester/types";

const KIND_LABEL: Record<ArchiveLink["kind"], string> = {
  doc: "📄 문서",
  sheet: "📊 시트",
  drive: "📁 드라이브",
  video: "🎬 영상",
  etc: "🔗 기타",
};

export default function ArchiveTab({ sid }: { sid: string }) {
  const { toast, uiConfirm } = useUI();
  const [links, setLinks] = useState<ArchiveLink[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<ArchiveLink["kind"]>("doc");

  useEffect(() => subscribeArchiveLinks(sid, setLinks, (e) => setLoadError(e.message)), [sid]);

  async function add() {
    if (!title.trim() || !url.trim()) return;
    if (!/^https?:\/\//.test(url.trim())) {
      toast("URL은 http(s)://로 시작해야 합니다", "warning");
      return;
    }
    try {
      await addArchiveLink(sid, { title: title.trim(), url: url.trim(), kind });
      setTitle("");
      setUrl("");
      toast("링크가 추가되었습니다", "success");
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

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <h3 className="font-semibold mb-2 text-sm">자료 링크 추가</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            aria-label="자료 종류"
            value={kind}
            onChange={(e) => setKind(e.target.value as ArchiveLink["kind"])}
            className="border border-gray-300 rounded-lg px-2 py-2 text-sm"
          >
            {Object.entries(KIND_LABEL).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목 (예: 2026 신청명단 시트)"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1"
          />
          <button
            onClick={() => void add()}
            disabled={!title.trim() || !url.trim()}
            className="px-4 py-2 rounded-lg bg-blue-100 hover:bg-blue-200 disabled:opacity-50 text-sm font-medium"
          >
            추가
          </button>
        </div>
      </div>

      <ul className="grid sm:grid-cols-2 gap-2">
        {links.map((l) => (
          <li key={l.id} className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-2">
            <a href={l.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 hover:underline">
              <div className="text-sm font-medium truncate">{l.title}</div>
              <div className="text-xs text-gray-400">{KIND_LABEL[l.kind]}</div>
            </a>
            <button
              aria-label={`${l.title} 삭제`}
              onClick={async () => {
                if (await uiConfirm(`'${l.title}' 링크를 삭제할까요?`)) await removeArchiveLink(sid, l.id);
              }}
              className="text-xs text-gray-300 hover:text-red-500"
            >
              ✕
            </button>
          </li>
        ))}
        {links.length === 0 && <p className="text-sm text-gray-400">아직 링크가 없습니다. 기존 시트·문서·폴더 링크를 등록해 유실을 막으세요.</p>}
      </ul>
    </div>
  );
}
