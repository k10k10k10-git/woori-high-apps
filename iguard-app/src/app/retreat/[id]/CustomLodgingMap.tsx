"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type {
  Group,
  IguardLodgingMap,
  PartialAttendanceMap,
  Room,
  Student,
} from "@/lib/types";
import type { LodgingRoomSummary } from "@/lib/lodgingMap";
import { summarizeLodgingRoom } from "@/lib/lodgingMap";
import {
  createIguardLodgingMapId,
  deleteIguardLodgingHotspot,
  deleteIguardLodgingMap,
  saveIguardLodgingHotspot,
  saveIguardLodgingMap,
} from "@/lib/db";
import { deleteLodgingMapPdf, uploadLodgingMapPdf } from "@/lib/lodgingMapStorage";
import { useUI } from "@/context/UIContext";

function roomLabel(room: Room): string {
  return `${room.dong ? `${room.dong} ` : ""}${room.roomNumber}호`;
}

function PdfPage({ url, page, onPageCount }: {
  url: string;
  page: number;
  onPageCount: (count: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.mjs",
          import.meta.url,
        ).toString();
        const document = await pdfjs.getDocument(url).promise;
        if (cancelled) return;
        onPageCount(document.numPages);
        const pdfPage = await document.getPage(Math.min(page, document.numPages));
        if (cancelled || !canvasRef.current) return;
        const viewport = pdfPage.getViewport({ scale: 1.6 });
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        if (!context) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const renderTask = pdfPage.render({ canvas, canvasContext: context, viewport });
        task = { cancel: () => renderTask.cancel() };
        await renderTask.promise;
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [onPageCount, page, url]);

  if (error) return <div className="p-8 text-center text-sm text-red-600">PDF 표시 오류: {error}</div>;
  return <canvas ref={canvasRef} className="block h-auto w-full select-none" />;
}

export default function CustomLodgingMap({
  retreatId,
  maps,
  rooms,
  groups,
  students,
  partial,
  cellColors,
  canManage,
  onSelect,
}: {
  retreatId: string;
  maps: IguardLodgingMap[];
  rooms: Room[];
  groups: Group[];
  students: Record<string, Student>;
  partial: PartialAttendanceMap;
  cellColors: Record<string, string>;
  canManage: boolean;
  onSelect: (summary: LodgingRoomSummary, anchor: HTMLButtonElement) => void;
}) {
  const { toast, uiConfirm } = useUI();
  const buildings = useMemo(
    () => [...new Set(rooms.map(room => (room.dong || "건물 미지정").trim()))].sort((a, b) => a.localeCompare(b, "ko")),
    [rooms],
  );
  const [mapId, setMapId] = useState(maps[0]?.id || "");
  const map = maps.find(item => item.id === mapId) || maps[0];
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [building, setBuilding] = useState(buildings[0] || "건물 미지정");
  const [label, setLabel] = useState("");
  const [roomId, setRoomId] = useState("");
  const [uploading, setUploading] = useState(false);
  const handlePageCount = useCallback((count: number) => {
    setPageCount(count);
  }, []);

  useEffect(() => {
    if (!mapId && maps[0]) setMapId(maps[0].id);
    if (map && page > (map.pageCount || pageCount)) setPage(1);
  }, [map, mapId, maps, page, pageCount]);

  const mapRooms = useMemo(() => {
    if (!map) return [];
    const exact = rooms.filter(room => (room.dong || "건물 미지정").trim() === map.building);
    return exact.length ? exact : rooms;
  }, [map, rooms]);

  async function upload(file: File | null) {
    if (!file) return;
    setUploading(true);
    const nextId = createIguardLodgingMapId(retreatId);
    try {
      const uploaded = await uploadLodgingMapPdf(retreatId, nextId, file);
      await saveIguardLodgingMap(retreatId, nextId, {
        label: label.trim() || file.name.replace(/\.pdf$/i, ""),
        building,
        fileName: file.name,
        ...uploaded,
        createdAt: Date.now(),
      });
      setMapId(nextId);
      setPage(1);
      setLabel("");
      toast("숙소 배치도 PDF를 추가했습니다. 호실을 고른 뒤 도면을 눌러 배치하세요.", "success");
    } catch (reason) {
      toast(`PDF 업로드 오류: ${reason instanceof Error ? reason.message : String(reason)}`, "error");
    } finally {
      setUploading(false);
    }
  }

  async function removeMap() {
    if (!map || !await uiConfirm(`"${map.label}" 배치도를 삭제할까요?`)) return;
    try {
      await deleteIguardLodgingMap(retreatId, map.id);
      try { await deleteLodgingMapPdf(map.filePath); } catch { /* DB 삭제는 완료됐으므로 파일 정리 실패만 무시 */ }
      setMapId("");
      toast("배치도를 삭제했습니다.", "success");
    } catch (reason) {
      toast(`삭제 오류: ${reason instanceof Error ? reason.message : String(reason)}`, "error");
    }
  }

  async function place(event: MouseEvent<HTMLDivElement>) {
    if (!canManage || !map || !roomId) return;
    if ((event.target as HTMLElement).closest("button")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    await saveIguardLodgingHotspot(retreatId, map.id, {
      roomId,
      page,
      left: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
      top: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
    });
    toast("호실 위치를 저장했습니다.", "success");
  }

  if (maps.length === 0) {
    return canManage ? (
      <section className="card border-dashed border-fuchsia-200 p-4">
        <h2 className="font-bold text-slate-800">새 장소의 숙소 배치도 추가</h2>
        <p className="mt-1 text-xs text-slate-500">PDF를 올리면 수련회별로 저장됩니다. 업로드 후 방을 선택하고 도면에서 해당 호실을 눌러주세요.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(150px,0.5fr)_minmax(180px,1fr)_auto]">
          <select className="input" value={building} onChange={event => setBuilding(event.target.value)}>
            {buildings.map(item => <option key={item}>{item}</option>)}
          </select>
          <input className="input" value={label} onChange={event => setLabel(event.target.value)} placeholder="배치도 이름 (예: 본관 1-3층)" />
          <label className="btn-primary flex min-h-11 cursor-pointer items-center justify-center">
            {uploading ? "업로드 중…" : "PDF 선택"}
            <input type="file" accept="application/pdf,.pdf" className="sr-only" disabled={uploading} onChange={event => void upload(event.target.files?.[0] || null)} />
          </label>
        </div>
      </section>
    ) : null;
  }

  if (!map) return null;
  const hotspots = Object.values(map.hotspots || {}).filter(hotspot => hotspot.page === page);

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-slate-100 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <select className="input min-h-10 min-w-[180px] flex-1" value={map.id} onChange={event => { setMapId(event.target.value); setPage(1); }}>
            {maps.map(item => <option key={item.id} value={item.id}>{item.label} · {item.building}</option>)}
          </select>
          {pageCount > 1 && (
            <select className="input min-h-10 w-24" value={page} onChange={event => setPage(Number(event.target.value))}>
              {Array.from({ length: pageCount }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}쪽</option>)}
            </select>
          )}
          {canManage && (
            <>
              <select className="input min-h-10 min-w-[180px]" value={roomId} onChange={event => setRoomId(event.target.value)}>
                <option value="">배치할 호실 선택</option>
                {mapRooms.map(room => <option key={room.id} value={room.id}>{roomLabel(room)}</option>)}
              </select>
              {roomId && map.hotspots?.[roomId] && (
                <button className="btn-secondary min-h-10 text-xs" onClick={() => void deleteIguardLodgingHotspot(retreatId, map.id, roomId)}>핀 제거</button>
              )}
              <button className="min-h-10 px-2 text-xs text-red-400 hover:text-red-600" onClick={() => void removeMap()}>도면 삭제</button>
            </>
          )}
        </div>
        {canManage && <p className="mt-2 text-xs text-fuchsia-600">{roomId ? "도면에서 호실 중심을 눌러 배치하세요." : "호실을 선택하면 도면에 핀을 놓을 수 있습니다."}</p>}
      </div>
      <div className="overflow-x-auto bg-slate-100 p-2 sm:p-4">
        <div className={`relative mx-auto min-w-[760px] max-w-[1400px] overflow-hidden rounded-lg border border-slate-300 bg-white ${canManage && roomId ? "cursor-crosshair" : ""}`} onClick={event => void place(event)}>
          <PdfPage
            url={map.fileUrl}
            page={page}
            onPageCount={handlePageCount}
          />
          {hotspots.map(hotspot => {
            const room = rooms.find(item => item.id === hotspot.roomId);
            if (!room) return null;
            const summary = summarizeLodgingRoom(room, students, partial, cellColors, groups, {
              buildingId: map.id,
              pageId: String(page),
              hotspot: { roomNumber: room.roomNumber, left: hotspot.left, top: hotspot.top },
            });
            if (!summary) return null;
            const female = room.type.includes("여");
            return (
              <button
                key={room.id}
                type="button"
                onClick={event => {
                  event.stopPropagation();
                  onSelect(summary, event.currentTarget);
                }}
                className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-md border px-2 py-1 text-center text-[10px] font-bold leading-tight shadow-md hover:scale-105 ${
                  female ? "border-rose-400 bg-rose-50/95 text-rose-700" : "border-sky-400 bg-sky-50/95 text-sky-700"
                }`}
                style={{ left: `${hotspot.left}%`, top: `${hotspot.top}%` }}
              >
                <span className="block text-[9px] font-medium opacity-70">{room.roomNumber}</span>
                <span>{summary.shortClassLabels.join("·") || "교사"}</span>
                {summary.groupLabels.length > 0 && <span className="mt-0.5 block border-t border-current/20 pt-0.5">{summary.groupLabels.join("·")}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
