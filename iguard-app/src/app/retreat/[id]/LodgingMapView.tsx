"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Group, IguardLodgingMap, PartialAttendanceMap, Room, Student } from "@/lib/types";
import {
  buildLodgingMapResult,
  LODGING_MAP_BUILDINGS,
  LodgingRoomSummary,
} from "@/lib/lodgingMap";
import CustomLodgingMap from "./CustomLodgingMap";

function roomLabel(room: Room): string {
  const dong = (room.dong ?? "").trim();
  return `${dong ? `${dong} ` : ""}${room.roomNumber}호`;
}

function markerLabel(summary: LodgingRoomSummary): string {
  if (summary.shortClassLabels.length === 0) return "교사";
  if (summary.shortClassLabels.length === 1) return summary.shortClassLabels[0];
  return `${summary.shortClassLabels[0]} +${summary.shortClassLabels.length - 1}`;
}

function markerGroupLabel(summary: LodgingRoomSummary): string {
  if (summary.groupLabels.length <= 2) return summary.groupLabels.join("·");
  return `${summary.groupLabels.slice(0, 2).join("·")} +${summary.groupLabels.length - 2}`;
}

interface PopoverPosition {
  left: number;
  top: number;
  width: number;
  arrowTop: number;
  side: "left" | "right";
}

export default function LodgingMapView({ retreatId, rooms, groups, students, partial, cellColors, maps, canManage }: {
  retreatId: string;
  rooms: Room[];
  groups: Group[];
  students: Record<string, Student>;
  partial: PartialAttendanceMap;
  cellColors: Record<string, string>;
  maps: IguardLodgingMap[];
  canManage: boolean;
}) {
  const result = useMemo(
    () => buildLodgingMapResult(rooms, students, partial, cellColors, groups),
    [rooms, groups, students, partial, cellColors],
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
  const [selection, setSelection] = useState<{ room: LodgingRoomSummary; anchor: HTMLButtonElement } | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(null);
  const mapScrollRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLElement | null>(null);

  const closePopover = useCallback(() => {
    setSelection(null);
    setPopoverPosition(null);
  }, []);

  const updatePopoverPosition = useCallback(() => {
    if (!selection || typeof window === "undefined") return;
    const anchorRect = selection.anchor.getBoundingClientRect();
    const margin = 12;
    const gap = 12;
    const width = Math.min(288, window.innerWidth - margin * 2);
    const height = popoverRef.current?.offsetHeight ?? 190;
    const canOpenRight = anchorRect.right + gap + width <= window.innerWidth - margin;
    const canOpenLeft = anchorRect.left - gap - width >= margin;
    const side: PopoverPosition["side"] = canOpenRight || !canOpenLeft ? "right" : "left";
    const preferredLeft = side === "right" ? anchorRect.right + gap : anchorRect.left - gap - width;
    const left = Math.min(window.innerWidth - margin - width, Math.max(margin, preferredLeft));
    const anchorCenter = anchorRect.top + anchorRect.height / 2;
    const maxTop = Math.max(margin, window.innerHeight - margin - height);
    const top = Math.min(maxTop, Math.max(margin, anchorCenter - height / 2));
    const arrowTop = Math.min(height - 18, Math.max(18, anchorCenter - top));
    setPopoverPosition({ left, top, width, arrowTop, side });
  }, [selection]);

  useEffect(() => {
    if (!building.pages.some(item => item.id === pageId)) setPageId(building.pages[0].id);
    closePopover();
  }, [building, closePopover, pageId]);

  useEffect(() => {
    mapScrollRef.current?.scrollTo({ left: 0, behavior: "auto" });
  }, [page.id]);

  useEffect(() => {
    if (!selection) return;
    updatePopoverPosition();
    const frame = window.requestAnimationFrame(updatePopoverPosition);
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (selection.anchor.contains(target) || popoverRef.current?.contains(target)) return;
      closePopover();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePopover();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closePopover, selection, updatePopoverPosition]);

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
        ℹ️ 수련회별 숙소 PDF 위에 행정사이트 방배정과 조편성을 실시간으로 표시합니다. 호실의 반·조 배지를 누르면 학생·교사 명단을 확인할 수 있습니다.
      </div>

      <CustomLodgingMap
        retreatId={retreatId}
        maps={maps}
        rooms={rooms}
        groups={groups}
        students={students}
        partial={partial}
        cellColors={cellColors}
        canManage={canManage}
        onSelect={(room, anchor) => setSelection({ room, anchor })}
      />

      <details className="group card overflow-hidden" open={maps.length === 0}>
        <summary className="cursor-pointer list-none border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-600">
          기본 제공 도면 <span className="ml-1 text-xs font-normal text-slate-400">{maps.length > 0 ? "펼치기" : "새 PDF를 올리기 전 예비 도면"}</span>
        </summary>
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
              {page.image ? (
                <img src={page.image} alt={`${building.label} ${page.floorLabel} 숙소 도면`} className="block h-auto w-full select-none" draggable={false} />
              ) : (
                <div
                  role="img"
                  aria-label={`${building.label} ${page.floorLabel} 간이 배치도`}
                  className="relative w-full overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100"
                  style={{ height: `${page.schematicHeight ?? 360}px` }}
                >
                  <div className="absolute left-1/2 top-1/2 h-[72%] w-px -translate-x-1/2 -translate-y-1/2 bg-slate-200" aria-hidden="true" />
                  {page.schematicZones?.map(zone => (
                    <div
                      key={zone.label}
                      className="absolute rounded-2xl border-2 border-slate-300 bg-white/80 shadow-sm"
                      style={{ left: `${zone.left}%`, top: `${zone.top}%`, width: `${zone.width}%`, height: `${zone.height}%` }}
                    >
                      <span className="absolute left-3 top-2 text-xs font-bold tracking-wide text-slate-400">{zone.label}</span>
                    </div>
                  ))}
                </div>
              )}
              {page.hotspots.map(hotspot => {
                const summary = summaryByRoom.get(hotspot.roomNumber);
                if (!summary) return null;
                const female = (summary.room.type ?? "").includes("여");
                const active = selection?.room.room.id === summary.room.id;
                return (
                  <button
                    key={`${page.id}-${hotspot.roomNumber}`}
                    type="button"
                    onClick={event => {
                      if (active) closePopover();
                      else setSelection({ room: summary, anchor: event.currentTarget });
                    }}
                    aria-expanded={active}
                    aria-controls={active ? "lodging-room-popover" : undefined}
                    aria-label={`${roomLabel(summary.room)} ${summary.classLabels.join(", ") || "교사 배정"}${summary.groupLabels.length > 0 ? ` ${summary.groupLabels.join(", ")}` : ""} 상세 보기`}
                    className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-md border px-1.5 py-1 text-center text-[10px] font-bold leading-tight shadow-md transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-fuchsia-500 ${
                      female
                        ? "border-rose-400 bg-rose-50/95 text-rose-700"
                        : "border-sky-400 bg-sky-50/95 text-sky-700"
                    } ${active ? "ring-2 ring-fuchsia-500" : ""}`}
                    style={{ left: `${hotspot.left}%`, top: `${hotspot.top}%` }}
                  >
                    <span className="block text-[9px] font-medium opacity-70">{hotspot.roomNumber}</span>
                    <span className="whitespace-nowrap">{markerLabel(summary)}</span>
                    {summary.groupLabels.length > 0 && (
                      <span className="mt-0.5 block whitespace-nowrap border-t border-current/20 pt-0.5 text-[9px] font-semibold opacity-80">
                        {markerGroupLabel(summary)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="mt-2 px-1 text-[11px] text-slate-400 sm:hidden">↔ 도면을 좌우로 밀어 전체 호실을 확인하세요.</p>
        </div>
      </details>

      {selection && popoverPosition && createPortal(
        <aside
          ref={popoverRef}
          id="lodging-room-popover"
          role="dialog"
          aria-label={`${roomLabel(selection.room.room)} 배정 상세`}
          className="fixed z-[100] max-h-[calc(100vh-24px)] overflow-y-auto rounded-xl border border-fuchsia-200 bg-white p-4 shadow-2xl"
          style={{ left: popoverPosition.left, top: popoverPosition.top, width: popoverPosition.width }}
        >
          <i
            aria-hidden="true"
            className={`absolute h-3 w-3 rotate-45 border border-fuchsia-200 bg-white ${
              popoverPosition.side === "right" ? "-left-1.5 border-r-0 border-t-0" : "-right-1.5 border-b-0 border-l-0"
            }`}
            style={{ top: popoverPosition.arrowTop - 6 }}
          />
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-900">{roomLabel(selection.room.room)}</h2>
              <p className="mt-0.5 text-xs text-slate-500">{selection.room.peopleCount}/{selection.room.room.capacity}명 · {selection.room.room.type || "성별 미지정"}</p>
            </div>
            <button type="button" onClick={closePopover} className="-mr-1 -mt-1 rounded p-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="호실 상세 닫기">✕</button>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="w-12 shrink-0 text-xs font-semibold text-fuchsia-600">반</span>
              <div className="flex flex-wrap gap-1">
                {selection.room.classLabels.length > 0
                  ? selection.room.classLabels.map(label => <span key={label} className="rounded bg-fuchsia-50 px-2 py-0.5 text-xs text-fuchsia-700">{label}</span>)
                  : <span className="text-xs text-slate-400">학생 배정 없음</span>}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-12 shrink-0 text-xs font-semibold text-sky-600">조</span>
              <div className="flex flex-wrap gap-1">
                {selection.room.groupLabels.length > 0
                  ? selection.room.groupLabels.map(label => <span key={label} className="rounded bg-sky-50 px-2 py-0.5 text-xs text-sky-700">{label}</span>)
                  : <span className="text-xs text-slate-400">조 미지정</span>}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-12 shrink-0 text-xs font-semibold text-slate-500">학생</span>
              <span className="text-xs leading-relaxed text-slate-700">{selection.room.studentNames.join(", ") || "—"}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-12 shrink-0 text-xs font-semibold text-emerald-600">교사</span>
              <span className="text-xs leading-relaxed text-slate-700">{selection.room.teacherNames.join(", ") || "—"}</span>
            </div>
          </div>
        </aside>,
        document.body,
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
        <span>배지 표기: 부-학년-반 · 조</span>
      </div>
    </div>
  );
}
