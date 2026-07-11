"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Retreat, PartialAttendance, Participant } from "@/lib/types";
import { getPartialAttendances, savePartialAttendance, deletePartialAttendance, getParticipants, getCellColors } from "@/lib/db";
import { useUI } from "@/context/UIContext";

interface Props { retreat: Retreat; }

type PartialType = PartialAttendance["type"];
// 작업 목록은 "신청자 취합에서 주황(부분참)으로 칠한 학생 ∪ 이미 선복귀/후발대로 지정된 학생"만 담는다.
// 전체/본대 전수 목록은 여기서 다루지 않는다(부분참 대상은 신청자 취합에서 주황으로 칠해 넘긴다).
type Filter = "전체" | "미지정" | PartialType;

interface ParticipantRow {
  sourceKey: string;
  studentKey: string;
  studentId: string;
  name: string;
  bu: string;
  buNum: number;
  grade: number;
  classNum: number;
  phone?: string | null;
  pPhone?: string | null;
  partial?: PartialAttendance;
}

const TYPE_OPTIONS: PartialType[] = ["선복귀", "후발대"];

const TYPE_COLORS: Record<PartialType | "미지정", string> = {
  "미지정": "bg-slate-100 text-slate-600 border-slate-200",
  "선복귀": "bg-orange-100 text-orange-700 border-orange-200",
  "후발대": "bg-sky-100 text-sky-700 border-sky-200",
};

function buToNum(bu: string): number {
  return bu === "2부" ? 2 : 1;
}

function makeStudentKey(p: Participant): string | null {
  if (!p.studentId) return null;
  const sid = String(p.studentId);
  // participant.studentId는 이미 uniqueKey("${buNum}_${rawId}") 형식으로 저장됨.
  // 부 접두를 또 붙이면 "1_1_..." 이중접두가 되어 이가드/셀색상 키와 어긋나므로 방어한다.
  return /^[12]_/.test(sid) ? sid : `${buToNum(p.bu)}_${sid}`;
}

function getStatus(row: ParticipantRow): PartialType | "미지정" {
  return row.partial?.type ?? "미지정";
}

export default function PartialAttendanceTab({ retreat }: Props) {
  const { toast } = useUI();
  const [records, setRecords] = useState<PartialAttendance[]>([]);
  const [participants, setParticipants] = useState<Record<string, Participant>>({});
  const [cellColors, setCellColors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("전체");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<PartialType>("선복귀");
  const [editingNote, setEditingNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [recs, parts, colors] = await Promise.all([
        getPartialAttendances(retreat.id),
        getParticipants(retreat.id),
        getCellColors(retreat.id),
      ]);
      setRecords(recs);
      setParticipants(parts);
      setCellColors(colors);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [retreat.id]);

  useEffect(() => { void load(); }, [load]);

  const recordMap = useMemo(() => new Map(records.map(r => [r.id, r])), [records]);

  const rows = useMemo<ParticipantRow[]>(() => {
    return Object.entries(participants)
      .flatMap(([sourceKey, p]) => {
        const studentKey = makeStudentKey(p);
        if (!studentKey || !p.studentId) return [];
        const redBySharedKey = cellColors[studentKey] === "red";
        const redByStudentId = cellColors[p.studentId] === "red";
        if (redBySharedKey || redByStudentId) return [];
        return [{
          sourceKey,
          studentKey,
          studentId: p.studentId,
          name: p.name,
          bu: p.bu,
          buNum: buToNum(p.bu),
          grade: p.grade,
          classNum: p.class,
          phone: p.phone,
          pPhone: p.pPhone,
          partial: recordMap.get(studentKey),
        }];
      })
      .sort((a, b) => {
        // 부분참(선복귀/후발대)을 맨 위로 — 본대 사이에 묻혀 찾기 어렵다는 피드백 반영
        const priority = (r: ParticipantRow) => r.partial?.type === "선복귀" ? 0 : r.partial?.type === "후발대" ? 1 : 2;
        return (
          priority(a) - priority(b) ||
          a.buNum - b.buNum ||
          a.grade - b.grade ||
          a.classNum - b.classNum ||
          a.name.localeCompare(b.name, "ko")
        );
      });
  }, [participants, cellColors, recordMap]);

  const unmatchedCount = useMemo(
    () => Object.values(participants).filter(p => !p.studentId).length,
    [participants],
  );

  const stats = useMemo(() => {
    const 선복귀 = rows.filter(r => r.partial?.type === "선복귀").length;
    const 후발대 = rows.filter(r => r.partial?.type === "후발대").length;
    const 본대 = rows.length - 선복귀 - 후발대;
    const day1Rows = rows.filter(r => r.partial?.type !== "후발대");
    const day3Rows = rows.filter(r => r.partial?.type !== "선복귀");
    return { total: rows.length, 본대, 선복귀, 후발대, day1Rows, day3Rows };
  }, [rows]);

  // 작업 대상 풀: 신청자 취합에서 주황(부분참)으로 칠한 학생 ∪ 이미 선복귀/후발대로 지정된 학생.
  // 주황 색칠이 곧 "이 학생을 부분참석 탭으로 넘긴다"는 신호 — 신청자 취합과 유기적으로 연동된다.
  const poolRows = useMemo(() => {
    return rows.filter(r =>
      !!r.partial || cellColors[r.studentKey] === "orange" || cellColors[r.studentId] === "orange",
    );
  }, [rows, cellColors]);

  const poolStats = useMemo(() => {
    const 선복귀 = poolRows.filter(r => r.partial?.type === "선복귀").length;
    const 후발대 = poolRows.filter(r => r.partial?.type === "후발대").length;
    const 미지정 = poolRows.filter(r => !r.partial).length;
    return { total: poolRows.length, 선복귀, 후발대, 미지정 };
  }, [poolRows]);

  const filteredRows = useMemo(() => {
    if (filter === "전체") return poolRows;
    if (filter === "미지정") return poolRows.filter(r => !r.partial);
    return poolRows.filter(r => r.partial?.type === filter);
  }, [poolRows, filter]);

  function openEditor(row: ParticipantRow, nextType?: PartialType) {
    setEditingKey(row.studentKey);
    setEditingType(nextType ?? row.partial?.type ?? "선복귀");
    setEditingNote(row.partial?.note ?? "");
  }

  async function saveType(row: ParticipantRow, type: PartialType, note?: string) {
    setSavingKey(row.studentKey);
    try {
      const data = {
        type,
        note: note?.trim() || undefined,
        updatedAt: Date.now(),
      };
      await savePartialAttendance(retreat.id, row.studentKey, data);
      setRecords(prev => [
        ...prev.filter(r => r.id !== row.studentKey),
        { id: row.studentKey, ...data },
      ]);
      setEditingKey(null);
      toast(`${row.name} ${type} 지정 완료`, "success");
    } catch (e) {
      toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setSavingKey(null);
    }
  }

  async function resetToMain(row: ParticipantRow) {
    if (!row.partial) return;
    setSavingKey(row.studentKey);
    try {
      await deletePartialAttendance(retreat.id, row.studentKey);
      setRecords(prev => prev.filter(r => r.id !== row.studentKey));
      setEditingKey(null);
      toast(`${row.name} 미지정으로 되돌림 (선복귀·후발대 해제)`, "success");
    } catch (e) {
      toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setSavingKey(null);
    }
  }

  const editingRow = editingKey ? rows.find(r => r.studentKey === editingKey) : null;

  if (loading) return <div className="text-center text-slate-400 py-10">로딩 중...</div>;

  return (
    <div className="space-y-4">
      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          로드 오류: {loadError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="card p-4">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-sm font-semibold text-slate-700">1일차 출발</span>
            <span className="text-xl font-bold text-sky-700">{stats.day1Rows.length}명</span>
          </div>
          <p className="text-xs text-slate-400">본대 {stats.본대} + 선복귀 {stats.선복귀}</p>
          <p className="text-[11px] text-slate-400 mt-1">후발대만 1일차 출발에서 제외</p>
        </div>
        <div className="card p-4">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-sm font-semibold text-slate-700">3일차 복귀</span>
            <span className="text-xl font-bold text-indigo-700">{stats.day3Rows.length}명</span>
          </div>
          <p className="text-xs text-slate-400">본대 {stats.본대} + 후발대 {stats.후발대}</p>
          <p className="text-[11px] text-slate-400 mt-1">선복귀만 3일차 복귀에서 제외</p>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">참가 확정 <strong className="text-slate-800">{stats.total}</strong></span>
          <span className="text-slate-300">·</span>
          <span className="text-slate-500">본대 <strong className="text-slate-800">{stats.본대}</strong></span>
          <span className="text-slate-300">·</span>
          <span className="text-slate-500">선복귀 <strong className="text-orange-600">{stats.선복귀}</strong></span>
          <span className="text-slate-300">·</span>
          <span className="text-slate-500">후발대 <strong className="text-sky-700">{stats.후발대}</strong></span>
          {poolStats.미지정 > 0 && (
            <>
              <span className="text-slate-300">·</span>
              <span className="text-slate-500">미지정 <strong className="text-orange-600">{poolStats.미지정}</strong></span>
            </>
          )}
          {unmatchedCount > 0 && <span className="text-xs text-slate-400 ml-auto">DB 미매칭 {unmatchedCount}명 제외</span>}
        </div>
      </div>

      <div className="rounded-lg border border-orange-200 bg-orange-50/60 p-3 text-xs text-orange-700">
        📋 <strong>신청자 취합에서 부분참(주황)으로 칠한 학생</strong>만 아래에 나옵니다. 여기서 <strong>선복귀 / 후발대</strong>를 지정하고 메모를 남기세요. 대상을 추가·제외하려면 신청자 취합에서 주황색을 켜고 끄면 됩니다.
      </div>

      <div className="flex flex-wrap gap-2">
        {(["전체", "선복귀", "후발대", "미지정"] as Filter[]).map(f => {
          const count = f === "전체" ? poolStats.total
            : f === "선복귀" ? poolStats.선복귀
            : f === "후발대" ? poolStats.후발대 : poolStats.미지정;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                filter === f ? "bg-slate-800 text-white border-slate-800" : "border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              {f} <span className={filter === f ? "text-slate-300" : "text-slate-400"}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
        <div className="card overflow-x-auto">
          {filteredRows.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <div className="text-3xl mb-2">⏰</div>
              {filter === "전체" ? (
                <p>부분참 대상 학생이 아직 없습니다.<br />
                  <span className="text-xs"><strong className="text-slate-500">신청자 취합</strong> 탭에서 부분참 학생을 <strong className="text-orange-500">주황색</strong>으로 칠하면 여기에 나타납니다.</span>
                </p>
              ) : (
                <p>이 구분에 해당하는 학생이 없습니다.</p>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="table-header">
                  <th className="px-4 py-2.5 text-left">이름</th>
                  <th className="px-4 py-2.5 text-left">부/학년반</th>
                  <th className="px-4 py-2.5 text-left">현재 구분</th>
                  <th className="px-4 py-2.5 text-left">메모</th>
                  <th className="px-4 py-2.5 text-left">지정</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map(row => {
                  const status = getStatus(row);
                  const disabled = savingKey === row.studentKey;
                  return (
                    <tr key={row.studentKey} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{row.name}</td>
                      <td className="px-4 py-2.5">
                        <span className={`tag ${row.bu === "1부" ? "tag-green" : "tag-purple"} mr-1`}>{row.bu}</span>
                        <span className="text-slate-600">{row.grade}학년 {row.classNum}반</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${TYPE_COLORS[status]}`}>
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs max-w-[16rem]">
                        <button
                          onClick={() => openEditor(row)}
                          disabled={disabled}
                          className="w-full text-left truncate text-slate-500 hover:text-slate-800 hover:underline disabled:opacity-40"
                          title="클릭해서 메모 수정"
                        >
                          {row.partial?.note || "메모 추가"}
                        </button>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            onClick={() => resetToMain(row)}
                            disabled={disabled || !row.partial}
                            title="선복귀·후발대 지정을 해제 (미지정으로)"
                            className="px-2.5 py-1 rounded-md border border-slate-200 text-xs text-slate-500 disabled:opacity-40 hover:bg-slate-50"
                          >
                            미지정
                          </button>
                          {TYPE_OPTIONS.map(type => (
                            <button
                              key={type}
                              onClick={() => row.partial?.type === type ? openEditor(row, type) : void saveType(row, type, row.partial?.note)}
                              disabled={disabled}
                              className={`px-2.5 py-1 rounded-md border text-xs disabled:opacity-40 ${
                                row.partial?.type === type ? TYPE_COLORS[type] : "border-slate-200 text-slate-500 hover:bg-slate-50"
                              }`}
                            >
                              {type}
                            </button>
                          ))}
                          <button
                            onClick={() => openEditor(row)}
                            disabled={disabled}
                            className="px-2.5 py-1 rounded-md border border-slate-200 text-xs text-slate-500 disabled:opacity-40 hover:bg-slate-50"
                          >
                            메모
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="card p-4 h-fit">
          <h3 className="text-sm font-bold text-slate-700 mb-3">예외 지정</h3>
          {editingRow ? (
            <div className="space-y-3">
              <div>
                <p className="font-semibold text-slate-800">{editingRow.name}</p>
                <p className="text-xs text-slate-400">{editingRow.bu} {editingRow.grade}학년 {editingRow.classNum}반</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {TYPE_OPTIONS.map(type => (
                  <button
                    key={type}
                    onClick={() => setEditingType(type)}
                    className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                      editingType === type ? TYPE_COLORS[type] : "border-slate-200 text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <textarea
                className="input text-sm resize-none"
                rows={4}
                placeholder="메모 (선택)"
                value={editingNote}
                onChange={e => setEditingNote(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => saveType(editingRow, editingType, editingNote)}
                  disabled={savingKey === editingRow.studentKey}
                  className="btn-primary flex-1 justify-center text-sm"
                >
                  저장
                </button>
                <button onClick={() => setEditingKey(null)} className="btn-secondary flex-1 justify-center text-sm">
                  취소
                </button>
              </div>
              {editingRow.partial && (
                <button
                  onClick={() => resetToMain(editingRow)}
                  disabled={savingKey === editingRow.studentKey}
                  className="w-full text-xs text-slate-400 hover:text-slate-700"
                >
                  본대(미지정)로 되돌리기
                </button>
              )}
            </div>
          ) : (
            <div className="text-sm text-slate-400 leading-relaxed">
              학생 행에서 <strong className="text-slate-500">선복귀</strong>, <strong className="text-slate-500">후발대</strong>, 또는 <strong className="text-slate-500">메모</strong>를 누르면 여기서 세부 내용을 수정할 수 있습니다.
            </div>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="card p-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-2">1일차 출발 명단</h4>
          <div className="flex flex-wrap gap-1.5">
            {stats.day1Rows.map(row => (
              <span key={row.studentKey} className="text-xs px-2 py-0.5 rounded-full border border-slate-200 text-slate-600">
                {row.name}
              </span>
            ))}
          </div>
        </div>
        <div className="card p-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-2">3일차 복귀 명단</h4>
          <div className="flex flex-wrap gap-1.5">
            {stats.day3Rows.map(row => (
              <span key={row.studentKey} className="text-xs px-2 py-0.5 rounded-full border border-slate-200 text-slate-600">
                {row.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
