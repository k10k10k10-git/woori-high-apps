"use client";
import { useEffect, useState } from "react";
import { Cancellation, Retreat, TeacherAttendance } from "@/lib/types";
import { subscribeToCancellations, subscribeToTeachers, subscribeToTeacherIdNumbers, updateTeacherIdNumber } from "@/lib/db";
import * as XLSX from "xlsx";
import { saveWorkbook, printAsPDF, exportAsJPG, escapeHtml } from "@/lib/exportUtils";
import { fetchSheetCSV } from "@/lib/sheetsParser";
import { useUI } from "@/context/UIContext";
import {
  excludeAbsentInsuranceTeachers,
  excludeCancelledInsuranceStudents,
  InsuranceStudentEntry,
} from "@/lib/insuranceRoster";

type StudentEntry = InsuranceStudentEntry;

interface TeacherRow extends TeacherAttendance {
  idDraft: string; // 입력 중인 값
  saving: boolean;
}

interface Props {
  retreat: Retreat;
}

export default function InsuranceTab({ retreat }: Props) {
  const { toast } = useUI();
  const [studentEntries, setStudentEntries] = useState<StudentEntry[]>([]);
  const [sheetStudentEntries, setSheetStudentEntries] = useState<StudentEntry[]>([]);
  const [teachers, setTeachers] = useState<TeacherAttendance[]>([]);
  const [teacherIdNumbers, setTeacherIdNumbers] = useState<Record<string, string>>({});
  const [cancellations, setCancellations] = useState<Cancellation[]>([]);
  const [teacherRows, setTeacherRows] = useState<TeacherRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showIds, setShowIds] = useState(false);
  const [buFilter, setBuFilter] = useState("전체");
  const [idColName, setIdColName] = useState("");
  const [sheetRefreshGeneration, setSheetRefreshGeneration] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError("");
    let active = true;
    if (retreat.sheetId) {
      void (async () => {
        try {
        const result = await fetchInsuranceFromSheet(retreat.sheetId, retreat.sheetGid);
          if (!active) return;
          setSheetStudentEntries(result.entries);
          setIdColName(result.idCol);
        } catch (error) {
          if (active) setError(error instanceof Error ? error.message : "오류가 발생했습니다.");
        } finally {
          if (active) setLoading(false);
        }
      })();
    } else {
      setSheetStudentEntries([]);
      setLoading(false);
    }
    return () => { active = false; };
  }, [retreat.sheetGid, retreat.sheetId, sheetRefreshGeneration]);

  useEffect(() => {
    const onError = (error: Error) => setError(error.message);
    const unsubs = [
      subscribeToTeachers(retreat.id, setTeachers, onError),
      subscribeToTeacherIdNumbers(retreat.id, setTeacherIdNumbers, onError),
      subscribeToCancellations(retreat.id, setCancellations, onError),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [retreat.id]);

  useEffect(() => {
    setStudentEntries(excludeCancelledInsuranceStudents(sheetStudentEntries, cancellations));
  }, [cancellations, sheetStudentEntries]);

  useEffect(() => {
    setTeacherRows((previous) => excludeAbsentInsuranceTeachers(teachers)
      .sort((a, b) => a.bu.localeCompare(b.bu) || a.classKey.localeCompare(b.classKey, "ko"))
      .map((teacher) => {
        const idNumber = teacherIdNumbers[teacher.id] || "";
        const old = previous.find((row) => row.id === teacher.id);
        return {
          ...teacher,
          idNumber,
          idDraft: old && old.idNumber === idNumber ? old.idDraft : idNumber,
          saving: old?.saving ?? false,
        };
      }));
  }, [teacherIdNumbers, teachers]);

  async function saveTeacherIdNumber(teacherId: string, idNumber: string) {
    setTeacherRows(prev => prev.map(t => t.id === teacherId ? { ...t, saving: true } : t));
    const nextIdNumber = idNumber.trim();
    try {
      await updateTeacherIdNumber(retreat.id, teacherId, nextIdNumber);
      setTeacherRows(prev => prev.map(t => t.id === teacherId ? { ...t, idNumber: nextIdNumber, saving: false } : t));
      toast("교사 주민등록번호를 저장했습니다.", "success");
    } catch (e) {
      setTeacherRows(prev => prev.map(t => t.id === teacherId ? { ...t, saving: false } : t));
      toast(e instanceof Error ? e.message : "교사 주민등록번호를 저장하지 못했습니다.", "error");
    }
  }

  function maskId(id: string) {
    if (!id) return "-";
    const clean = id.replace("-", "");
    return clean.slice(0, 6) + "-" + "*".repeat(Math.max(0, clean.length - 6));
  }

  // 보험 등록된 교사 (주민등록번호 있는 교사)
  const teacherInsured = teacherRows.filter(t => t.idNumber?.trim());

  // 전체 보험 목록 (교사 + 학생)
  const allInsured = [
    ...teacherInsured.map(t => ({ type: "교사/스탭" as const, name: t.name, bu: t.bu, grade: 0, cls: 0, idNumber: t.idNumber! })),
    ...studentEntries.map(s => ({ type: "학생" as const, ...s })),
  ];

  const filteredInsured = buFilter === "전체" ? allInsured
    : buFilter === "교사/스탭" ? allInsured.filter(e => e.type === "교사/스탭")
    : allInsured.filter(e => e.type === "학생" && e.bu === buFilter);

  const filteredTeachers = buFilter === "전체" || buFilter === "교사/스탭"
    ? teacherRows
    : teacherRows.filter(t => t.bu === buFilter);

  function exportXLSX() {
    const data = filteredInsured.map((e, i) => ({
      "번호": i + 1,
      "구분": e.type,
      "이름": e.name,
      "부": e.bu,
      "학년": e.grade > 0 ? `${e.grade}학년` : "",
      "반": e.cls > 0 ? `${e.cls}반` : "",
      "주민등록번호": e.idNumber,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 6 }, { wch: 8 }, { wch: 6 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "여행자보험");
    saveWorkbook(wb, `${retreat.name}_여행자보험`);
  }

  function buildInsuranceHtml() {
    const rows = filteredInsured.map((e, i) =>
      `<tr><td>${i + 1}</td><td>${escapeHtml(e.type)}</td><td>${escapeHtml(e.name)}</td><td>${escapeHtml(e.bu)}</td><td>${e.grade > 0 ? `${e.grade}학년 ${e.cls}반` : "-"}</td><td>${escapeHtml(e.idNumber)}</td></tr>`
    ).join("");
    return `
      <h1>${escapeHtml(retreat.name)} 여행자 보험 신청자 명단</h1>
      <p class="subtitle">총 ${filteredInsured.length}명 · 출력일: ${new Date().toLocaleDateString("ko-KR")}</p>
      <table>
        <thead><tr><th>번호</th><th>구분</th><th>이름</th><th>부</th><th>학년·반</th><th>주민등록번호</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function exportPDF() {
    if (!printAsPDF(buildInsuranceHtml(), `${retreat.name}_여행자보험`)) {
      toast("팝업이 차단되어 PDF를 열 수 없습니다. 브라우저 팝업 허용을 확인해주세요.", "error");
    }
  }

  async function exportJPG() {
    if (!await exportAsJPG(buildInsuranceHtml(), `${retreat.name}_여행자보험`)) {
      toast("JPG 저장에 실패했습니다.", "error");
    }
  }

  async function copyToClipboard(text: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(successMessage, "success");
    } catch {
      toast("클립보드 복사에 실패했습니다. 브라우저 권한을 확인해주세요.", "error");
    }
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-slate-400">불러오는 중...</div>;

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">여행자 보험</h2>
          <p className="text-xs text-slate-500 mt-0.5">신청취소 학생과 불참 교사·스탭은 자동으로 제외됩니다.</p>
          {idColName && <p className="text-xs text-slate-400 mt-0.5">학생 주민번호 컬럼: <span className="font-mono bg-slate-100 px-1 rounded">{idColName}</span></p>}
        </div>
        <div className="flex gap-2">
          <button onClick={exportXLSX} disabled={allInsured.length === 0} className="btn-secondary text-xs">📥 XLSX</button>
          <button onClick={exportPDF} disabled={allInsured.length === 0} className="btn-secondary text-xs">🖨️ PDF</button>
          <button onClick={exportJPG} disabled={allInsured.length === 0} className="btn-secondary text-xs">🖼️ JPG</button>
          <button onClick={() => setSheetRefreshGeneration((value) => value + 1)} className="btn-secondary text-xs">🔄 시트 새로고침</button>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          ⚠ 로드 오류: {error}
        </div>
      )}

      {/* 필터 */}
      <div className="flex gap-1">
        {["전체", "교사/스탭", "1부", "2부"].map(b => (
          <button key={b} onClick={() => setBuFilter(b)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              buFilter === b ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}>
            {b === "전체" ? `전체 (${allInsured.length}명)` :
             b === "교사/스탭" ? `교사/스탭 (${teacherInsured.length}명)` :
             `${b} (${allInsured.filter(e => e.type === "학생" && e.bu === b).length}명)`}
          </button>
        ))}
      </div>

      {/* ── 교사/스탭 주민등록번호 입력 ── */}
      {(buFilter === "전체" || buFilter === "교사/스탭") && (
        <div className="card overflow-x-auto">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="font-semibold text-sm text-slate-700">👨‍🏫 교사/스탭 주민등록번호</span>
            <span className="text-xs text-slate-400">교사 참석 탭 기준 · {teacherInsured.length}/{teacherRows.length}명 입력됨</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">이름</th>
                <th className="text-left px-4 py-2 font-medium">부</th>
                <th className="text-left px-4 py-2 font-medium">담당반</th>
                <th className="text-left px-4 py-2 font-medium">주민등록번호</th>
                <th className="px-4 py-2 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(buFilter === "교사/스탭" ? teacherRows : filteredTeachers).map(t => (
                <tr key={t.id} className={`hover:bg-slate-50 ${t.idNumber?.trim() ? "" : "opacity-60"}`}>
                  <td className="px-4 py-2 font-medium text-slate-800">{t.name}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                      t.bu === "1부" ? "bg-green-100 text-green-700" :
                      t.bu === "2부" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                    }`}>{t.bu}</span>
                  </td>
                  <td className="px-4 py-2 text-slate-500 text-xs">{t.classKey || "—"}</td>
                  <td className="px-4 py-2">
                    <input
                      className="input font-mono text-sm py-1"
                      placeholder="000000-0000000"
                      value={t.idDraft}
                      onChange={e => setTeacherRows(prev => prev.map(r => r.id === t.id ? { ...r, idDraft: e.target.value } : r))}
                      onKeyDown={e => { if (e.key === "Enter") saveTeacherIdNumber(t.id, t.idDraft); }}
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => saveTeacherIdNumber(t.id, t.idDraft)}
                      disabled={t.saving || t.idDraft === (t.idNumber || "")}
                      className="text-xs px-2 py-1 rounded bg-blue-600 text-white disabled:opacity-40 hover:bg-blue-700 whitespace-nowrap"
                    >
                      {t.saving ? "..." : "저장"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 보험 등록 명단 (주민등록번호 입력된 인원) ── */}
      {filteredInsured.length > 0 && (
        <div className="card overflow-x-auto">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="font-semibold text-sm text-slate-700">📋 보험 등록 명단</span>
            <div className="flex gap-2">
              <button onClick={() => setShowIds(s => !s)} className="btn-secondary text-xs">
                {showIds ? "🙈 주민번호 가리기" : "👁 주민번호 보기"}
              </button>
              <button onClick={() => {
                const lines = ["구분\t이름\t부\t학년반\t주민등록번호"];
                filteredInsured.forEach(e => lines.push(`${e.type}\t${e.name}\t${e.bu}\t${e.grade > 0 ? `${e.grade}학년 ${e.cls}반` : "-"}\t${e.idNumber}`));
                copyToClipboard(lines.join("\n"), `${filteredInsured.length}명 복사 완료`);
              }} className="btn-secondary text-xs">📋 복사</button>
            </div>
          </div>
          {!showIds && (
            <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
              ⚠️ 주민등록번호는 민감 정보입니다. &quot;주민번호 보기&quot;를 눌러야 표시됩니다.
            </div>
          )}
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">번호</th>
                <th className="text-left px-4 py-2.5 font-medium">구분</th>
                <th className="text-left px-4 py-2.5 font-medium">이름</th>
                <th className="text-left px-4 py-2.5 font-medium">부</th>
                <th className="text-left px-4 py-2.5 font-medium">학년·반</th>
                <th className="text-left px-4 py-2.5 font-medium">주민등록번호</th>
                <th className="px-4 py-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredInsured.map((e, i) => (
                <tr key={`${e.type}-${e.name}-${e.bu}-${i}`} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-400">{i + 1}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                      e.type === "교사/스탭" ? "bg-purple-100 text-purple-700" : "bg-blue-50 text-blue-700"
                    }`}>{e.type}</span>
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{e.name}</td>
                  <td className="px-4 py-2.5 text-slate-600">{e.bu}</td>
                  <td className="px-4 py-2.5 text-slate-600">{e.grade > 0 ? `${e.grade}학년 ${e.cls}반` : "-"}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-800">
                    {showIds ? (e.idNumber || "-") : maskId(e.idNumber)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => copyToClipboard(e.idNumber, `${e.name} 복사 완료`)}
                      className="text-xs text-slate-400 hover:text-blue-600">복사</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2.5 border-t border-slate-100 text-right text-xs text-slate-400">
            총 {filteredInsured.length}명
          </div>
        </div>
      )}
    </div>
  );
}

// ── 시트 파싱 ──────────────────────────────────────────────────────────────

interface FetchResult {
  entries: StudentEntry[];
  insuranceCol: string;
  idCol: string;
}

async function fetchInsuranceFromSheet(sheetId: string, gid: string): Promise<FetchResult> {
  const rows = await fetchSheetCSV(sheetId, gid);
  if (rows.length < 2) return { entries: [], insuranceCol: "", idCol: "" };

  const headers = rows[0].map(h => h.trim());
  const idIdx = headers.findIndex(h => h.includes("주민"));
  if (idIdx === -1) throw new Error("주민등록번호 컬럼을 찾을 수 없습니다. (헤더에 '주민' 포함 필요)");
  const insuranceIdx = headers.findIndex(h => h.includes("보험"));

  const entries: StudentEntry[] = [];
  const seenIds = new Set<string>(); // 중복 제출 제거 — 동일 주민번호 = 동일인 (최초 응답 유지)
  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    const name = values[1]?.trim();
    if (!name) continue;
    const idNumber = values[idIdx]?.trim() || "";
    if (!idNumber) continue;
    const idKey = idNumber.replace(/\D/g, "");
    if (idKey.length >= 7) {
      if (seenIds.has(idKey)) continue;
      seenIds.add(idKey);
    }
    const bu = values[3]?.trim() || "";
    let grade = 0, cls = 0;
    for (let j = 4; j < headers.length; j++) {
      const h = headers[j], v = values[j]?.trim() || "";
      if (!v) continue;
      if (h.includes("학년") && !h.includes("반")) { const m = v.match(/(\d+)학년/); if (m) grade = parseInt(m[1]); }
      else if (h.includes("반")) { const m = v.match(/(\d+)반/); if (m) cls = parseInt(m[1]); }
    }
    entries.push({ name, bu, grade, cls, idNumber });
  }
  return { entries, insuranceCol: insuranceIdx !== -1 ? headers[insuranceIdx] : "", idCol: headers[idIdx] };
}
