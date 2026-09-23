"use client";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import {
  subscribeToCellColors,
  subscribeToGroups,
  subscribeToPartialAttendances,
  subscribeToParticipants,
  subscribeToRooms,
  subscribeToRetreatStudentsByYear,
} from "@/lib/db";
import type { Group, Participant, PartialAttendance, Room, Student } from "@/lib/types";
import { buildRetreatPrepStatus } from "@/features/portal/retreatPrepStatus";

/**
 * 탭 구조보다 먼저 "지금 남은 일"을 보여주는 한 줄 요약.
 * 읽기 전용이며, 각 항목은 그 일을 처리하는 탭으로 보낸다.
 */
export default function RetreatPrepSummary({
  retreatId,
  retreatYear,
  onOpenTab,
}: {
  retreatId: string;
  retreatYear: number;
  onOpenTab: (tabIdx: number) => void;
}) {
  const [participants, setParticipants] = useState<Record<string, Participant> | null>(null);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [students, setStudents] = useState<Record<string, Student> | null>(null);
  const [cellColors, setCellColors] = useState<Record<string, string> | null>(null);
  const [partialAttendances, setPartialAttendances] = useState<PartialAttendance[] | null>(null);
  const [loadError, setLoadError] = useState("");

  // 수련회가 바뀌면 호출 측이 key로 이 컴포넌트를 새로 마운트한다 —
  // effect 안에서 상태를 되돌리지 않아야 렌더가 연쇄로 다시 돌지 않는다.
  useEffect(() => {
    // 요약은 보조 정보다. 한 갈래라도 막히면 스피너를 남기지 않고 안내 문구로 끝낸다.
    const fail = () => setLoadError("준비 상태를 불러오지 못했습니다. 각 탭에서 직접 확인해 주세요.");
    const unsubscribers = [
      subscribeToParticipants(retreatId, setParticipants, fail),
      subscribeToGroups(retreatId, setGroups, fail),
      subscribeToRooms(retreatId, setRooms, fail),
      subscribeToRetreatStudentsByYear(retreatId, retreatYear, setStudents, fail),
      subscribeToCellColors(retreatId, setCellColors, fail),
      subscribeToPartialAttendances(retreatId, setPartialAttendances, fail),
    ];
    return () => unsubscribers.forEach((off) => off());
  }, [retreatId, retreatYear]);

  if (loadError) {
    return <p className="retreat-prep-summary retreat-prep-summary--muted" role="status">{loadError}</p>;
  }
  if (!participants || !groups || !rooms || !students || !cellColors || !partialAttendances) {
    return (
      <p className="retreat-prep-summary retreat-prep-summary--muted" role="status">
        준비 상태를 확인하는 중입니다.
      </p>
    );
  }

  const { stages, attentionCount } = buildRetreatPrepStatus({
    participants,
    groups,
    rooms,
    students,
    cellColors,
    partialAttendances,
  });
  const roster = stages.find((stage) => stage.key === "roster")!;
  const pending = stages.filter((stage) => stage.tone === "attention");

  return (
    <div className="retreat-prep-summary">
      {attentionCount === 0 ? (
        <p className="retreat-prep-summary__done">
          <CheckCircle aria-hidden="true" size={17} weight="fill" />
          남은 준비가 없습니다 — 학생 매칭과 조·방 배정이 모두 정리됐습니다.
        </p>
      ) : (
        <>
          <span className="retreat-prep-summary__lead">
            <WarningCircle aria-hidden="true" size={17} weight="fill" />
            남은 준비 {attentionCount}가지
          </span>
          <span className="retreat-prep-summary__items">
            {pending.map((stage) => (
              <button
                key={stage.key}
                type="button"
                onClick={() => onOpenTab(stage.tabIdx)}
                className="retreat-prep-chip"
              >
                <strong>{stage.label}</strong>
                <span>{stage.detail}</span>
                <ArrowRight aria-hidden="true" size={14} weight="bold" />
              </button>
            ))}
          </span>
        </>
      )}
      <span className="retreat-prep-summary__roster">{roster.detail}</span>
    </div>
  );
}
