"use client";

// 출석 체크 — 모바일 최우선(375px). 학생별 [출석/지각/결석] 3버튼.
// ⚠ 토글 아님: 멱등 명시 상태 기록 (같은 버튼 재탭 = 동일 상태 유지, 실수 규칙 11).
// 기록 취소는 별도 '지우기'로만.

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useUI } from "@/context/UIContext";
import { clearAttendance, setAttendance, subscribeSessionAttendance } from "@/lib/db";
import { Application, AttendanceStatus, Session, SessionAttendance, Team } from "@/lib/types";

interface Props {
  sid: string;
  teams: Team[];
  sessions: Session[];
  applications: Application[];
  teamById: Map<string, Team>;
}

const STATUS_BTN: { s: AttendanceStatus; on: string }[] = [
  { s: "출석", on: "bg-green-100 text-green-900 border-green-300" },
  { s: "지각", on: "bg-yellow-100 text-yellow-900 border-yellow-300" },
  { s: "결석", on: "bg-red-100 text-red-900 border-red-300" },
];

function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function AttendanceTab({ sid, teams, sessions, applications, teamById }: Props) {
  const { user } = useAuth();
  const { toast } = useUI();
  const [sessId, setSessId] = useState<string>("");
  const [teamFilter, setTeamFilter] = useState<string>("");
  const [att, setAtt] = useState<SessionAttendance>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const userPicked = useMemo(() => ({ current: false }), []); // 자동 선택이 사용자 선택을 덮지 않게 (패턴 17)

  // 오늘(또는 가장 가까운 미래) 회차 자동 선택 — 사용자가 고른 뒤엔 덮지 않음
  useEffect(() => {
    if (userPicked.current || sessions.length === 0) return;
    const today = todayYMD();
    const candidate =
      sessions.find((s) => s.date === today) ??
      sessions.find((s) => s.date >= today) ??
      sessions[sessions.length - 1];
    setSessId(candidate.id);
  }, [sessions, userPicked]);

  useEffect(() => {
    if (!sessId) return;
    setLoadError(null);
    return subscribeSessionAttendance(sid, sessId, setAtt, (e) => setLoadError(e.message));
  }, [sid, sessId]);

  const session = sessions.find((s) => s.id === sessId);
  const members = useMemo(
    () =>
      applications
        .filter((a) => a.status !== "취소" && !a.trainingOnly && a.teamId)
        .filter((a) => !teamFilter || a.teamId === teamFilter)
        .sort((a, b) => {
          const ta = teamById.get(a.teamId!)?.order ?? 99;
          const tb = teamById.get(b.teamId!)?.order ?? 99;
          return ta - tb || a.bu.localeCompare(b.bu) || a.grade - b.grade || a.class - b.class;
        }),
    [applications, teamFilter, teamById],
  );

  async function mark(appKey: string, status: AttendanceStatus) {
    try {
      await setAttendance(sid, sessId, appKey, status, user?.uid);
    } catch (e) {
      toast(`기록 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  if (sessions.length === 0) {
    return <p className="text-sm text-gray-400">먼저 설정 탭에서 회차(모임 날짜)를 등록해주세요.</p>;
  }

  const counts = { 출석: 0, 지각: 0, 결석: 0, 미기록: 0 };
  for (const m of members) {
    const e = att[m.id];
    if (e) counts[e.s]++;
    else counts.미기록++;
  }

  return (
    <div>
      {loadError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          ⚠ 출석 로드 오류: {loadError}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        <select
          aria-label="회차 선택"
          value={sessId}
          onChange={(e) => {
            userPicked.current = true;
            setSessId(e.target.value);
          }}
          className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm"
        >
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.date} {s.label ?? ""} {s.type !== "정규" ? `(${s.type})` : ""}
            </option>
          ))}
        </select>
        <select
          aria-label="팀 필터"
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm"
        >
          <option value="">전체 팀</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {session?.type === "휴강" && (
        <div className="mb-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
          이 회차는 휴강입니다 — 출석 집계(만점)에서 제외됩니다.
        </div>
      )}

      <div className="flex gap-3 text-xs text-gray-500 mb-3">
        <span>출석 {counts.출석}</span>
        <span>지각 {counts.지각}</span>
        <span>결석 {counts.결석}</span>
        <span>미기록 {counts.미기록}</span>
        <span className="ml-auto">{members.length}명</span>
      </div>

      <ul className="grid gap-1.5">
        {members.map((m) => {
          const entry = att[m.id];
          const team = teamById.get(m.teamId!);
          return (
            <li key={m.id} className="bg-white border border-gray-200 rounded-lg px-3 py-2 flex items-center gap-2">
              <div className="flex-1 min-w-0 text-sm">
                <span className="font-medium">{m.name}</span>
                <span className="text-xs text-gray-400 ml-1.5">
                  {m.bu} {m.grade}-{m.class}
                </span>
                {team && !teamFilter && (
                  <span className={`text-xs px-1.5 py-0.5 rounded ml-1.5 ${team.color}`}>{team.name}</span>
                )}
              </div>
              <div className="flex gap-1">
                {STATUS_BTN.map(({ s, on }) => (
                  <button
                    key={s}
                    onClick={() => void mark(m.id, s)}
                    aria-label={`${m.name} ${s}`}
                    aria-pressed={entry?.s === s}
                    className={`px-2.5 py-1.5 rounded-md text-xs border font-medium ${
                      entry?.s === s ? on : "border-gray-200 text-gray-400 hover:border-gray-300"
                    }`}
                  >
                    {s}
                  </button>
                ))}
                {entry && (
                  <button
                    onClick={() => void clearAttendance(sid, sessId, m.id)}
                    aria-label={`${m.name} 기록 지우기`}
                    className="px-1.5 text-xs text-gray-300 hover:text-gray-500"
                  >
                    ⌫
                  </button>
                )}
              </div>
            </li>
          );
        })}
        {members.length === 0 && <p className="text-sm text-gray-400">배치된 인원이 없습니다. 배치 탭에서 먼저 배치해주세요.</p>}
      </ul>
    </div>
  );
}
