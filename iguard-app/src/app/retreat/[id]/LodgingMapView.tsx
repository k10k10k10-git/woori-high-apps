"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PartialAttendanceMap, Room, Student } from "@/lib/types";
import {
  buildLodgingMapResult,
  LODGING_MAP_BUILDINGS,
  LodgingRoomSummary,
} from "@/lib/lodgingMap";

function roomLabel(room: Room): string {
  const dong = (room.dong ?? "").trim();
  return `${dong ? `${dong} ` : ""}${room.roomNumber}호`;
}

function markerLabel(summary: LodgingRoomSummary): string {
  if (summary.shortClassLabels.length === 0) return "교사";
  if (summary.shortClassLabels.length === 1) return summary.shortClassLabels[0];
  return `${summary.shortClassLabels[0]} +${summary.shortClassLabels.length - 1}`;
}

export default function LodgingMapView({ rooms, students, partial, cellColors }: {
  rooms: Room[];
  students: Record<string, Student>;
  partial: PartialAttendanceMap;
  cellColors: Record<string, string>;
}) {
  const result = useMemo(
    () => buildLodgingMapResult(rooms, students, partial, cellColors),
    [rooms, students, partial, cellColors],
  );
  const countsByBuilding = useMemo(() => {
    const counts = new Map<string, number>();
    result.mapped.forEach(summary => counts.set(summary.buildingId, (counts.get(summary.buildingId) ?? 0) + 1));
    return counts;
  }, [result.mapped]);
  const firstAssignedBuilding = LODGING_MAP_BUILDINGS.find(building => (countsByBuilding.get(building.id) ?? 0) > 0);
  const [buildingId, setBuildingId] = useState(firstAssignedBuilding?.id ?? LODGING_MAP_BUILDINGS[0].id);
  const building = LODGING_MAP_BUILDINGS.find(item => item.id === buildingId) ?? LODGING_MAP_BUILDINGS[0];
  const [pageId, setPageId] = useState(building.pages[0].id);
  const page = building.pages.find(item => item.id === pageId) ?? building.pages[0];
  const [selectedRoom, setSelectedRoom] = useState<LodgingRoomSummary | null>(null);
  const mapScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!building.pages.some(item => item.id === pageId)) setPageId(building.pages[0].id);
    setSelectedRoom(null);
  }, [building, pageId]);

  useEffect(() => {
    mapScrollRef.current?.scrollTo({ left: 0, behavior: "auto" });
  }, [page.id]);

  const pageRooms = result.mapped.filter(summary => summary.pageId === page.id);
  const summaryByRoom = new Map(pageRooms.map(summary => [summary.hotspot.roomNumber, summary]));

  if (rooms.length === 0) return (
    <div className="card p-8 text-center text-slate-400">
      <div className="mb-2 text-3xl" aria-hidden="true">🗺️</div>
      <p>행정사이트 방배정이 아직 없습니다.</p>
      <p className="mt-1 text-xs text-slate-300">방배정을 저장하면 도면의 해당 호실에 자동 표시됩니다.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-fuchsia-100 bg-fuchsia-50 p-3 text-xs leading-relaxed text-fuchsia-700">
        ℹ️ 행정사이트 방배정을 실시간으로 읽어 도면 위에 표시합니다. 호실의 반 배지를 누르면 학생·교사 명단을 확인할 수 있습니다.
      </div>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-100 p-3 sm:p-4">
          <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="숙소 건물 선택">
            {LODGING_MAP_BUILDINGS.map(item => {
              const active = item.id === building.id;
              const count = countsByBuilding.get(item.id) ?? 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setBuildingId(item.id);
                    setPageId(item.pages[0].id);
                  }}
                  className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold transition-colors ${
                    active
                      ? "border-fuchsia-600 bg-fuchsia-600 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-fuchsia-300"
                  }`}
                >
                  {item.label}<span className={`ml-1 ${active ? "text-fuchsia-100" : "text-slate-400"}`}>{count}</span>
                </button>
              );
            })}
          </div>

          {building.pages.length > 1 && (
            <div className="mt-3 flex gap-1.5" role="tablist" aria-label={`${building.label} 층 선택`}>
              {building.pages.map(item => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={item.id === page.id}
                  onClick={() => setPageId(item.id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                    item.id === page.id ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {item.floorLabel}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-2 sm:p-4">
          <div className="mb-2 flex items-center justify-between gap-3 px-1 text-xs text-slate-500">
            <span>{building.label} · {page.floorLabel}</span>
            <span>배정 호실 <strong className="text-slate-700">{pageRooms.length}</strong></span>
          </div>
          <div ref={mapScrollRef} className="overflow-x-auto overscroll-x-contain rounded-lg border border-slate-200 bg-slate-100 [-webkit-overflow-scrolling:touch]">
            <div className="relative" style={{ minWidth: `${page.minWidth}px` }}>
              <img src={page.image} alt={`${building.label} ${page.floorLabel} 숙소 도면`} className="block h-auto w-full select-none" draggable={false} />
              {page.hotspots.map(hotspot => {
                const summary = summaryByRoom.get(hotspot.roomNumber);
                if (!summary) return null;
                const female = (summary.room.type ?? "").includes("여");
                const active = selectedRoom?.room.id === summary.room.id;
                return (
                  <button
                    key={`${page.id}-${hotspot.roomNumber}`}
                    type="button"
                    onClick={() => setSelectedRoom(summary)}
                    aria-label={`${roomLabel(summary.room)} ${summary.classLabels.join(", ") || "교사 배정"} 상세 보기`}
                    className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-md border px-1.5 py-1 text-center text-[10px] font-bold leading-tight shadow-md transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-fuchsia-500 ${
                      female
                        ? "border-rose-400 bg-rose-50/95 text-rose-700"
                        : "border-sky-400 bg-sky-50/95 text-sky-700"
                    } ${active ? "ring-2 ring-fuchsia-500" : ""}`}
                    style={{ left: `${hotspot.left}%`, top: `${hotspot.top}%` }}
                  >
                    <span className="block text-[9px] font-medium opacity-70">{hotspot.roomNumber}</span>
                    <span className="whitespace-nowrap">{markerLabel(summary)}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <p className="mt-2 px-1 text-[11px] text-slate-400 sm:hidden">↔ 도면을 좌우로 밀어 전체 호실을 확인하세요.</p>
        </div>
      </section>

      {selectedRoom && (
        <section className="card border-fuchsia-200 p-4" aria-live="polite">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-900">{roomLabel(selectedRoom.room)}</h2>
              <p className="mt-0.5 text-xs text-slate-500">{selectedRoom.peopleCount}/{selectedRoom.room.capacity}명 · {selectedRoom.room.type || "성별 미지정"}</p>
            </div>
            <button type="button" onClick={() => setSelectedRoom(null)} className="text-sm text-slate-400 hover:text-slate-600" aria-label="호실 상세 닫기">✕</button>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="w-12 shrink-0 text-xs font-semibold text-fuchsia-600">반</span>
              <div className="flex flex-wrap gap-1">
                {selectedRoom.classLabels.length > 0
                  ? selectedRoom.classLabels.map(label => <span key={label} className="rounded bg-fuchsia-50 px-2 py-0.5 text-xs text-fuchsia-700">{label}</span>)
                  : <span className="text-xs text-slate-400">학생 배정 없음</span>}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-12 shrink-0 text-xs font-semibold text-slate-500">학생</span>
              <span className="text-xs leading-relaxed text-slate-700">{selectedRoom.studentNames.join(", ") || "—"}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-12 shrink-0 text-xs font-semibold text-emerald-600">교사</span>
              <span className="text-xs leading-relaxed text-slate-700">{selectedRoom.teacherNames.join(", ") || "—"}</span>
            </div>
          </div>
        </section>
      )}

      {result.unmatched.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <div className="font-semibold">⚠ 도면과 연결되지 않은 배정 호실 {result.unmatched.length}개</div>
          <p className="mt-1 leading-relaxed text-amber-700">건물명 또는 호실 번호가 첨부 도면과 다릅니다: {result.unmatched.map(roomLabel).join(", ")}</p>
        </section>
      )}

      <div className="flex flex-wrap gap-3 px-1 text-[11px] text-slate-500">
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border border-sky-400 bg-sky-50" />남자 방</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border border-rose-400 bg-rose-50" />여자 방</span>
        <span>배지 표기: 부-학년-반</span>
      </div>
    </div>
  );
}
