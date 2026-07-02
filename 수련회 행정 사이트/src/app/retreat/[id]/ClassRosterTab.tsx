"use client";
import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { Retreat, Participant } from "@/lib/types";
import { useUI } from "@/context/UIContext";
import { getParticipants, getCellColors, subscribeToCellColors, subscribeToParticipants, setCellColor, saveCancellation, getCancellations, getCancellationByStudentKey, deleteCancellation, getClassesByYear } from "@/lib/db";
import * as XLSX from "xlsx";
import { saveWorkbook, printAsPDF } from "@/lib/exportUtils";
import { normalizeName, stripSuffix as stripSuffixStrict } from "@/lib/studentMatcher";
import { LATE_REGISTRANT_COLORS } from "@/lib/constants";

interface StudentInfo {
  id: string;
  name: string;
  num: number;
  grade: number;
  classNum: number;
  phone?: string;
  jang?: boolean; // 장결자(장기결석) — 명단에서 별도 구역으로 분리 표시
}

interface ClassInfo {
  buNum: number;   // 1=1부, 2=2부
  grade: number;   // 학년 (1/2/3)
  classNum: number; // 반 번호
  teacher: string;
  students: StudentInfo[];
}

type BuTab = "1부" | "2부";

const CELL_COLORS = ["green", "purple", "blue", "orange", "red"] as const;
type CellColor = typeof CELL_COLORS[number];
// 사용자가 명시적으로 지정한 색상 — "단순 참가자 표시(cellActive)"보다 진하게 해 뚜렷이 구분되게 함.
// 초록/보라(신청자 태그)는 파스텔 톤으로, 파랑/주황/빨강은 진하게 유지.
const COLOR_CLASSES: Record<CellColor, string> = {
  green:  "bg-green-100 text-green-800 font-semibold border-green-300 cursor-pointer",
  purple: "bg-purple-100 text-purple-800 font-semibold border-purple-300 cursor-pointer",
  blue:   "bg-blue-200 text-blue-900 font-semibold border-blue-400 cursor-pointer",
  orange: "bg-orange-200 text-orange-900 font-semibold border-orange-400 cursor-pointer",
  red:    "bg-red-200 text-red-900 font-semibold border-red-400 cursor-pointer",
};
const COLOR_LABELS: Record<CellColor, string> = {
  green: "1부 신청자", purple: "2부 신청자", blue: "입금완료", orange: "부분참", red: "신청취소",
};

// 느슨한 접미사 제거 (매칭 인덱스용) — studentMatcher의 stripSuffix(엄격)와 다름
function stripSuffix(n: string) {
  return n.replace(/[A-Za-z]+$/, "").trim();
}

export default function ClassRosterTab({ retreat }: { retreat: Retreat }) {
  const { toast } = useUI();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bu, setBu] = useState<BuTab>("1부");
  const [cellColors, setCellColorsState] = useState<Record<string, string>>({});
  const [pickerKey, setPickerKey] = useState<string | null>(null);
  const autoSyncedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [classesRaw, partsMap, colors, existingCancellations] = await Promise.all([
        getClassesByYear(retreat.year),
        getParticipants(retreat.id),
        getCellColors(retreat.id),
        getCancellations(retreat.id),
      ]);
      setParticipants(Object.values(partsMap));
      setCellColorsState(colors);

      const infos: ClassInfo[] = [];
      Object.entries(classesRaw).forEach(([classKey, cd]) => {
        const parts = classKey.split("-");
        const buNum    = parseInt(parts[0]);
        const grade    = parseInt(parts[1]);
        const classNum = parseInt(parts[2]);
        if (!buNum || !grade || !classNum) return;
        const studs: StudentInfo[] = Object.entries(cd.students || {})
          .map(([id, s]) => ({ id, grade, classNum, name: s.name, num: s.num ?? 0, phone: s.phone, jang: !!s.jang }))
          .sort((a, b) => a.name.localeCompare(b.name, "ko"));
        infos.push({ buNum, grade, classNum, teacher: cd.teacher || "", students: studs });
      });
      infos.sort((a, b) => a.buNum - b.buNum || a.grade - b.grade || a.classNum - b.classNum);
      setClasses(infos);

      // 기존 빨간색 셀 → 취소명단 자동 동기화 (세션 내 최초 1회만 실행)
      if (!autoSyncedRef.current) {
        autoSyncedRef.current = true;
        const existingKeys = new Set(existingCancellations.map(c => c.studentKey).filter(Boolean));
        const redEntries = Object.entries(colors).filter(([, color]) => color === "red");
        for (const [key] of redEntries) {
          if (existingKeys.has(key)) continue;
          const [buNumStr, studentId] = key.split("_");
          const buNum = parseInt(buNumStr);
          const bu = buNum === 1 ? "1부" : "2부" as "1부" | "2부";
          const targetClass = infos.find(c => c.buNum === buNum && c.students.some(s => s.id === studentId));
          if (!targetClass) continue;
          const student = targetClass.students.find(s => s.id === studentId);
          if (!student) continue;
          await saveCancellation(retreat.id, {
            bu, grade: targetClass.grade, class: targetClass.classNum,
            name: student.name, phone: "", reason: "", account: "", note: "",
            studentKey: key,
          });
        }
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [retreat.id, retreat.year]);

  useEffect(() => {
    void load();
    const unsubColors = subscribeToCellColors(retreat.id, setCellColorsState);
    const unsubParts = subscribeToParticipants(retreat.id, (parts) => {
      setParticipants(Object.values(parts));
    });
    return () => { unsubColors(); unsubParts(); };
  }, [load, retreat.id]);

  // 선택한 부의 클래스만
  const visibleClasses = useMemo(() => {
    const buNum = bu === "1부" ? 1 : 2;
    return classes.filter(c => c.buNum === buNum);
  }, [classes, bu]);

  // 평시/장결 분리 — 메인 명단은 평시만, 장결자는 하단 별도 구역. (열=반 구조 유지)
  const regularClasses = useMemo(
    () => visibleClasses.map(c => ({ ...c, students: c.students.filter(s => !s.jang) })),
    [visibleClasses]
  );
  const jangClasses = useMemo(
    () => visibleClasses.map(c => ({ ...c, students: c.students.filter(s => s.jang) })),
    [visibleClasses]
  );
  const hasJang = useMemo(() => jangClasses.some(c => c.students.length > 0), [jangClasses]);
  const jangMaxRows = useMemo(() => Math.max(0, ...jangClasses.map(c => c.students.length)), [jangClasses]);

  // 통계·매칭은 평시 학생 기준(장결자는 집계 제외)
  const allStudents = useMemo(() => regularClasses.flatMap(c => c.students), [regularClasses]);

  // 선택한 부의 참가자를 Firebase studentId에 매핑
  const participantByStudentId = useMemo(() => {
    const buParts = participants.filter(p => p.bu?.includes(bu === "1부" ? "1" : "2"));
    const result = new Map<string, Participant>();

    // 이름/정규화/suffix별 인덱스를 한 번만 빌드 → O(n) 조회
    const byId = new Map(allStudents.map(s => [s.id, s]));
    const byName = new Map<string, StudentInfo[]>();
    const byNorm = new Map<string, StudentInfo[]>();
    const byStripped = new Map<string, StudentInfo[]>();
    allStudents.forEach(s => {
      const push = <K,>(m: Map<K, StudentInfo[]>, k: K) => { const a = m.get(k) ?? []; a.push(s); m.set(k, a); };
      push(byName, s.name);
      push(byNorm, normalizeName(s.name));
      push(byStripped, stripSuffix(s.name));
    });

    buParts.forEach(p => {
      const pName = p.name.trim();
      const pNorm = normalizeName(pName);
      const g = p.grade, c = p.class;

      let found: StudentInfo | undefined;

      // 0) 저장된 studentId로 직접 매칭 (가장 신뢰도 높음)
      if (p.studentId) found = byId.get(p.studentId);

      // 1) 원본 이름 + 학년 + 반
      if (!found && g > 0 && c > 0) found = byName.get(pName)?.find(s => s.grade === g && s.classNum === c);
      // 2) 원본 이름 + 학년
      if (!found && g > 0)           found = byName.get(pName)?.find(s => s.grade === g);
      // 3) 정규화 이름 + 학년 + 반
      if (!found && g > 0 && c > 0 && pNorm.length >= 2) found = byNorm.get(pNorm)?.find(s => s.grade === g && s.classNum === c);
      // 4) 정규화 이름 + 학년
      if (!found && g > 0 && pNorm.length >= 2)           found = byNorm.get(pNorm)?.find(s => s.grade === g);
      // 5) suffix 제거 이름 + 학년 + 반
      if (!found && g > 0 && c > 0) found = byStripped.get(pName)?.find(s => s.grade === g && s.classNum === c);
      // 6) suffix 제거 이름 + 학년
      if (!found && g > 0)           found = byStripped.get(pName)?.find(s => s.grade === g);
      // 7) 원본 이름 유일 매칭
      if (!found) { const ex = byName.get(pName); if (ex?.length === 1) found = ex[0]; }
      // 8) 정규화 이름 유일 매칭 (2글자 이상)
      if (!found && pNorm.length >= 2) { const ex = byNorm.get(pNorm); if (ex?.length === 1) found = ex[0]; }
      // 9) suffix 제거 이름 유일 매칭
      if (!found) { const ex = byStripped.get(pName); if (ex?.length === 1) found = ex[0]; }

      if (found && !result.has(found.id)) result.set(found.id, p);
    });

    return result;
  }, [participants, allStudents, bu]);

  const buParts = useMemo(
    () => participants.filter(p => p.bu?.includes(bu === "1부" ? "1" : "2")),
    [participants, bu]
  );

  // 매칭 안 된 신청자
  const unmatchedParts = useMemo(() => {
    const matchedNames = new Set(Array.from(participantByStudentId.values()).map(p => p.name));
    return buParts.filter(p => !matchedNames.has(p.name));
  }, [buParts, participantByStudentId]);

  // 중복 신청자 (동일 studentId로 2회 이상 신청)
  const duplicateParts = useMemo(() => {
    const countBySid: Record<string, { name: string; grade: number; cls: number; count: number }> = {};
    buParts.forEach(p => {
      const key = p.studentId ?? `name:${p.name}`;
      if (!p.studentId) return; // 미매칭은 별도 처리
      if (!countBySid[key]) countBySid[key] = { name: p.name, grade: p.grade, cls: p.class, count: 0 };
      countBySid[key].count++;
    });
    return Object.values(countBySid).filter(d => d.count > 1).sort((a, b) => b.count - a.count);
  }, [buParts]);

  // 불일치 신청자 studentId 집합 — 신청서 기재 부서/학년/반 vs 실제 DB 위치 비교
  const mismatchedStudentIds = useMemo(() => {
    const buNum = bu === "1부" ? 1 : 2;
    const result = new Set<string>();
    participantByStudentId.forEach((p, studentId) => {
      const targetClass = visibleClasses.find(c => c.students.some(s => s.id === studentId));
      if (!targetClass) return;
      if (p.grade && targetClass.grade && p.grade !== targetClass.grade) { result.add(studentId); return; }
      if (p.class && targetClass.classNum && p.class !== targetClass.classNum) { result.add(studentId); return; }
      const pBuNum = p.bu?.includes("1") ? 1 : p.bu?.includes("2") ? 2 : 0;
      if (pBuNum && pBuNum !== buNum) { result.add(studentId); }
    });
    return result;
  }, [participantByStudentId, visibleClasses, bu]);

  // 전체 부서 학생 목록 (1부+2부 통합) — 동명이인 탐지용
  const allStudentsAllBu = useMemo(() => classes.flatMap(c => c.students), [classes]);

  // 불일치 신청자와 동명이인인 모든 학생 ID 집합 (다른 부서 포함) — 노란색으로 표시
  const mismatchCandidateIds = useMemo(() => {
    const normName = (n: string) => stripSuffixStrict(normalizeName(n));
    const result = new Set<string>();
    // 불일치 매칭 학생의 동명이인 후보 (전체 부서 탐색)
    mismatchedStudentIds.forEach(sid => {
      const p = participantByStudentId.get(sid);
      if (!p) return;
      const pNorm = normName(p.name.trim());
      allStudentsAllBu.forEach(s => { if (normName(s.name) === pNorm) result.add(s.id); });
    });
    // 미매칭 동명이인 참가자의 DB 후보 — 전체 부서 기준으로 탐색
    participants.forEach(p => {
      if (p.studentId) return;
      const pNorm = normName(p.name.trim());
      const matches = allStudentsAllBu.filter(s => normName(s.name) === pNorm);
      if (matches.length >= 2) matches.forEach(s => result.add(s.id));
    });
    return result;
  }, [mismatchedStudentIds, participantByStudentId, allStudentsAllBu, participants]);

  const grades = useMemo(() => [...new Set(visibleClasses.map(c => c.grade))].sort(), [visibleClasses]);

  const maxRows = useMemo(
    () => Math.max(0, ...regularClasses.map(c => c.students.length)),
    [regularClasses]
  );

  // 중복 제거한 고유 참가자 — DB 매칭된 인원만 카운트
  const uniqueParts = useMemo(() => {
    const seen = new Set<string>();
    return buParts.filter(p => {
      if (!p.studentId) return false; // 미매칭 제외
      if (seen.has(p.studentId)) return false;
      seen.add(p.studentId);
      return true;
    });
  }, [buParts]);

  const stats = useMemo(() => uniqueParts.reduce(
    (acc, p) => {
      acc.total++;
      if (p.studentId != null) acc.matched++;
      if (p.gender === "남") acc.male++;
      else if (p.gender === "여") acc.female++;
      return acc;
    },
    { total: 0, matched: 0, male: 0, female: 0 }
  ), [uniqueParts]);

  // 색상별 인원 (입금완료/부분참/신청취소/잔여) — cellColors 실시간 반영
  // 후기 신청자(색칠된 비참가자)도 포함
  const colorStats = useMemo(() => {
    const buNum = bu === "1부" ? 1 : 2;
    let formBlue = 0, formOrange = 0, formRed = 0;
    participantByStudentId.forEach((_, studentId) => {
      const color = cellColors[`${buNum}_${studentId}`];
      if (color === "blue") formBlue++;
      else if (color === "orange") formOrange++;
      else if (color === "red") formRed++;
    });
    let lateBlue = 0, lateOrange = 0, lateParticipant = 0;
    allStudents.forEach(s => {
      if (participantByStudentId.has(s.id)) return;
      const color = cellColors[`${buNum}_${s.id}`];
      if (color === "blue") lateBlue++;
      else if (color === "orange") lateOrange++;
      else if (color === "green" || color === "purple") lateParticipant++;
    });
    const lateCount = lateBlue + lateOrange + lateParticipant;
    const total = uniqueParts.length + lateCount;
    return {
      blue: formBlue + lateBlue,
      orange: formOrange + lateOrange,
      red: formRed,
      // unprocessed = 폼 미처리 + 후기 신청자 중 신청자 색상
      unprocessed: total - (formBlue + lateBlue) - (formOrange + lateOrange) - formRed,
      lateCount,
      total,
    };
  }, [participantByStudentId, allStudents, uniqueParts, cellColors, bu]);

  async function setColorDirectly(
    buNum: number, studentId: string, studentName: string,
    grade: number, classNum: number, targetColor: string | null
  ) {
    const key = `${buNum}_${studentId}`;
    const buStr = buNum === 1 ? "1부" : "2부" as "1부" | "2부";
    const current = cellColors[key] as CellColor | undefined;
    const next = targetColor as CellColor | null;

    // 색상 즉시 변경 후 Firebase 저장에 실패하면 원복
    setCellColorsState(prev => {
      const updated = { ...prev };
      if (!next) delete updated[key];
      else updated[key] = next;
      return updated;
    });
    try {
      await setCellColor(retreat.id, key, next);
    } catch {
      setCellColorsState(prev => {
        const updated = { ...prev };
        if (!current) delete updated[key];
        else updated[key] = current;
        return updated;
      });
      toast("색상 저장에 실패했습니다. 변경을 되돌렸습니다.", "error");
      return;
    }

    // side effects
    try {
      if (current === "red" && next !== "red") {
        const ex = await getCancellationByStudentKey(retreat.id, key);
        if (ex) await deleteCancellation(retreat.id, ex.id);
      }
      if (next === "red" && current !== "red") {
        const ex = await getCancellationByStudentKey(retreat.id, key);
        if (!ex) await saveCancellation(retreat.id, {
          bu: buStr, grade, class: classNum, name: studentName,
          phone: "", reason: "", account: "", note: "", studentKey: key,
        });
      }
    } catch {
      toast("자동 동기화 중 오류가 발생했습니다.", "error");
    }
  }

  function getStatus(buNum: number, studentId: string, isParticipant: boolean): string {
    const key = `${buNum}_${studentId}`;
    const color = cellColors[key];
    if (color === "blue") return "입금완료";
    if (color === "orange") return "부분참";
    if (color === "red") return "신청취소";
    if (color === "green" || color === "purple") return "신청";
    if (isParticipant) return "신청";
    return "";
  }

  function exportRosterXLSX() {
    const buNum = bu === "1부" ? 1 : 2;
    const rows: Record<string, string | number>[] = [];
    const pushRows = (cols: typeof regularClasses, gubun: string) => {
      cols.forEach(cls => {
        cls.students.forEach(s => {
          const isParticipant = participantByStudentId.has(s.id);
          const status = getStatus(buNum, s.id, isParticipant);
          rows.push({ "구분": gubun, "부": `${cls.buNum}부`, "학년": `${cls.grade}학년`, "반": `${cls.classNum}반`, "담임": cls.teacher, "이름": s.name, "참가상태": status });
        });
      });
    };
    pushRows(regularClasses, "");        // 평시 명단
    pushRows(jangClasses, "장결자");      // 장결자 명단(하단 분리)
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 7 }, { wch: 6 }, { wch: 8 }, { wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `신청자취합_${bu}`);
    saveWorkbook(wb, `${retreat.name}_신청자취합_${bu}`);
  }

  function exportRosterPDF() {
    const isGreenBu = bu === "1부";

    // 학년 그룹별 colspan 계산
    const gradeSpans: { grade: number; count: number }[] = [];
    grades.forEach(grade => {
      gradeSpans.push({ grade, count: visibleClasses.filter(c => c.grade === grade).length });
    });

    const C = "border:1px solid #cbd5e1";
    const gradeHeader = gradeSpans.map(gs =>
      `<th colspan="${gs.count}" style="${C};padding:3px 4px;background:#f1f5f5;font-weight:700;text-align:center;font-size:10px">${gs.grade}학년</th>`
    ).join("");

    const classHeader = visibleClasses.map(cls =>
      `<th style="${C};padding:2px 3px;background:#f8fafc;font-size:9px;text-align:center">${cls.classNum}반</th>`
    ).join("");

    const teacherHeader = visibleClasses.map(cls =>
      `<th style="${C};padding:2px 3px;background:#f8fafc;font-size:8px;font-weight:400;text-align:center;color:#64748b;white-space:nowrap;overflow:hidden;max-width:48px">${cls.teacher || "—"}</th>`
    ).join("");

    const buildRow = (cols: typeof regularClasses, rowIdx: number) => {
      const numCell = `<td style="${C};padding:1px 3px;text-align:center;font-size:8px;color:#94a3b8;background:#f8fafc">${rowIdx + 1}</td>`;
      const cells = cols.map(cls => {
        const student = cls.students[rowIdx];
        if (!student) return `<td style="border:1px solid #f1f5f9;padding:1px 3px"></td>`;
        const isParticipant = participantByStudentId.has(student.id);
        const isMismatch = mismatchedStudentIds.has(student.id);
        const colorKey = `${cls.buNum}_${student.id}`;
        const color = cellColors[colorKey] as CellColor | undefined;
        const bg = color === "blue"   ? "#bfdbfe"
                 : color === "orange" ? "#fed7aa"
                 : color === "red"    ? "#fecaca"
                 : color === "green"  ? "#bbf7d0"
                 : color === "purple" ? "#e9d5ff"
                 : (isMismatch || mismatchCandidateIds.has(student.id)) ? "#fef08a"
                 : isParticipant ? (isGreenBu ? "#bbf7d0" : "#e9d5ff")
                 : "transparent";
        const fw = (color || isParticipant) ? "600" : "400";
        return `<td style="${C};padding:1px 3px;text-align:center;font-size:9px;background:${bg};font-weight:${fw};white-space:nowrap">${student.name}</td>`;
      }).join("");
      return `<tr>${numCell}${cells}</tr>`;
    };
    const regBody = Array.from({ length: maxRows }).map((_, r) => buildRow(regularClasses, r)).join("");
    const jangBody = hasJang
      ? `<tr><td colspan="${visibleClasses.length + 1}" style="${C};padding:3px 4px;background:#fffbeb;color:#b45309;font-weight:700;font-size:9px;text-align:left">장결자 명단 (평시 미출석 — 집계 제외)</td></tr>`
        + Array.from({ length: jangMaxRows }).map((_, r) => buildRow(jangClasses, r)).join("")
      : "";
    const bodyRows = regBody + jangBody;

    const legendItems = [
      { bg: isGreenBu ? "#bbf7d0" : "#e9d5ff", label: "신청" },
      { bg: "#bfdbfe", label: "입금완료" },
      { bg: "#fed7aa", label: "부분참" },
      { bg: "#fecaca", label: "신청취소" },
    ].map(l => `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:10px;font-size:10px">
      <span style="width:12px;height:12px;background:${l.bg};border-radius:2px;display:inline-block"></span>${l.label}
    </span>`).join("");

    const html = `
      <h1 style="margin:0 0 2px;font-size:14px">${retreat.name} 신청자 취합 (${bu})</h1>
      <p style="font-size:10px;color:#888;margin:0 0 6px">총 ${stats.total}명 (남 ${stats.male} / 여 ${stats.female}) · 출력일: ${new Date().toLocaleDateString("ko-KR")}</p>
      <div style="margin-bottom:8px">${legendItems}</div>
      <table style="border-collapse:collapse;width:100%;table-layout:auto">
        <thead>
          <tr><th style="${C};padding:3px 4px;background:#f1f5f5;font-size:9px"></th>${gradeHeader}</tr>
          <tr><th style="${C};padding:2px 3px;background:#f8fafc;font-size:8px;font-weight:400;color:#94a3b8">반</th>${classHeader}</tr>
          <tr><th style="${C};padding:2px 3px;background:#f8fafc;font-size:8px;font-weight:400;color:#94a3b8">담임</th>${teacherHeader}</tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    `;
    if (!printAsPDF(html, `${retreat.name}_신청자취합_${bu}`, true)) {
      toast("팝업이 차단되어 PDF를 열 수 없습니다. 브라우저 팝업 허용을 확인해주세요.", "error");
    }
  }

  const isGreen = bu === "1부";
  // 단순 "이 부에 신청됨" 자동 표시 — 사용자가 수동으로 지정한 신청자 태그(COLOR_CLASSES.green/purple)와
  // 완전히 같은 색으로 맞춰 자동/수동 구분 없이 일관되게 보이게 한다.
  const cellActive = isGreen ? COLOR_CLASSES.green : COLOR_CLASSES.purple;
  const statActive = isGreen ? "text-green-700 font-bold" : "text-purple-700 font-bold";

  // 학생 셀 렌더 — 평시 명단과 장결자 구역에서 공용 (색상/매칭/색 지정 동일)
  const renderCell = (cls: ClassInfo, student: StudentInfo | undefined, rowIdx: number, keyPrefix: string) => {
    if (!student) {
      return <td key={`e-${keyPrefix}-${cls.grade}-${cls.classNum}-${rowIdx}`} className="border border-slate-100 px-1 py-0.5" />;
    }
    const isParticipant = participantByStudentId.has(student.id);
    const isMismatch = mismatchedStudentIds.has(student.id);
    const colorKey = `${cls.buNum}_${student.id}`;
    const color = cellColors[colorKey] as CellColor | undefined;
    const isCandidate = !isMismatch && mismatchCandidateIds.has(student.id);
    const cellClass = color
      ? COLOR_CLASSES[color]
      : isMismatch || isCandidate
        ? "bg-yellow-100 text-yellow-800 font-semibold border-yellow-300 cursor-pointer"
        : isParticipant
          ? `${cellActive} cursor-pointer`
          : "border-slate-100 text-slate-600 cursor-pointer hover:bg-slate-50";
    const titleText = color
      ? `${student.name} [${COLOR_LABELS[color]}] (클릭하여 변경)`
      : isMismatch
        ? `${student.name} ⚠ 신청서 불일치 — 클릭하여 색 지정`
      : isCandidate
        ? `${student.name} ⚠ 동명이인 후보 — 클릭하여 색 지정`
        : isParticipant
          ? `${student.name} (${bu} 신청) — 클릭하여 색 지정`
          : `${student.name} — 클릭하여 색 지정`;
    return (
      <td key={`s-${keyPrefix}-${cls.grade}-${cls.classNum}-${rowIdx}`}
        title={titleText}
        onClick={() => { setPickerKey(prev => prev === colorKey ? null : colorKey); }}
        className={`border px-1 py-0.5 text-center transition-colors select-none relative ${cellClass}`}>
        {student.name}
        {pickerKey === colorKey && (
          <div
            className="absolute z-20 top-full left-0 mt-0.5 bg-white border border-slate-200 rounded-lg shadow-lg p-2 sm:p-1.5 flex gap-1.5 sm:gap-1"
            onClick={e => e.stopPropagation()}
          >
            {[
              { color: cls.buNum === 1 ? "green" : "purple", label: cls.buNum === 1 ? "1부 신청자" : "2부 신청자", cls: cls.buNum === 1 ? "bg-green-400" : "bg-purple-400" },
              { color: "blue",   label: "입금완료", cls: "bg-blue-400" },
              { color: "orange", label: "부분참",   cls: "bg-orange-400" },
              { color: "red",    label: "신청취소", cls: "bg-red-400" },
            ].map(opt => (
              <button
                key={opt.color}
                title={opt.label}
                onClick={() => {
                  setColorDirectly(cls.buNum, student.id, student.name, cls.grade, cls.classNum, opt.color);
                  setPickerKey(null);
                }}
                className={`w-7 h-7 sm:w-5 sm:h-5 rounded-full ${opt.cls} hover:scale-110 transition-transform`}
              />
            ))}
            <button
              title="색상 제거"
              onClick={() => {
                setColorDirectly(cls.buNum, student.id, student.name, cls.grade, cls.classNum, null);
                setPickerKey(null);
              }}
              className="w-7 h-7 sm:w-5 sm:h-5 rounded-full bg-slate-200 text-slate-500 text-xs flex items-center justify-center hover:bg-slate-300"
            >×</button>
          </div>
        )}
      </td>
    );
  };

  if (loading) return <div className="text-center text-slate-400 py-10">로딩 중...</div>;
  if (loadError) return (
    <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
      ⚠ 로드 오류: {loadError}
    </div>
  );

  return (
    <div>
      {/* 1부/2부 탭 + 내보내기 */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="flex gap-2">
          {(["1부", "2부"] as BuTab[]).map(b => (
            <button key={b} onClick={() => setBu(b)}
              className={`px-5 sm:px-6 py-2 rounded-lg font-semibold text-sm transition-colors ${
                bu === b
                  ? b === "1부" ? "bg-green-600 text-white shadow-sm" : "bg-purple-600 text-white shadow-sm"
                  : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}>
              {b}
            </button>
          ))}
        </div>
        <div className="flex gap-2 ml-auto">
          <button onClick={exportRosterXLSX} disabled={visibleClasses.length === 0} className="btn-secondary text-xs">📥 XLSX</button>
          <button onClick={exportRosterPDF} disabled={visibleClasses.length === 0} className="btn-secondary text-xs">🖨️ PDF</button>
        </div>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-5">
        <div className="card p-2.5 sm:p-3 text-center">
          <div className="text-lg sm:text-xl font-bold text-blue-600">{colorStats.blue}</div>
          <div className="flex items-center justify-center gap-1 mt-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-300 inline-block" />
            <span className="text-xs text-slate-500">입금완료</span>
          </div>
        </div>
        <div className="card p-2.5 sm:p-3 text-center">
          <div className="text-lg sm:text-xl font-bold text-orange-500">{colorStats.orange}</div>
          <div className="flex items-center justify-center gap-1 mt-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-orange-300 inline-block" />
            <span className="text-xs text-slate-500">부분참</span>
          </div>
        </div>
        <div className="card p-2.5 sm:p-3 text-center">
          <div className="text-lg sm:text-xl font-bold text-red-500">{colorStats.red}</div>
          <div className="flex items-center justify-center gap-1 mt-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-300 inline-block" />
            <span className="text-xs text-slate-500">신청취소</span>
          </div>
        </div>
        <div className="card p-2.5 sm:p-3 text-center">
          <div className="text-lg sm:text-xl font-bold text-slate-500">{colorStats.unprocessed}</div>
          <div className="flex items-center justify-center gap-1 mt-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-200 inline-block" />
            <span className="text-xs text-slate-500">잔여</span>
          </div>
        </div>
      </div>

      {/* 합계 표시 */}
      {colorStats.total > 0 && (
        <div className="text-xs text-slate-400 -mt-3 mb-4 text-right pr-1">
          {colorStats.blue} + {colorStats.orange} + {colorStats.unprocessed}
          {colorStats.red > 0 && <span className="text-red-400"> − {colorStats.red}(취소)</span>}
          {" = "}
          <span className={`font-semibold ${isGreen ? "text-green-700" : "text-purple-700"}`}>
            {colorStats.total - colorStats.red}명
          </span>
          {colorStats.lateCount > 0 && (
            <span className="text-teal-500 ml-2">(현장 {colorStats.lateCount}명 포함)</span>
          )}
        </div>
      )}

      {participants.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700 mb-4">
          ⚠ 참가자 명단 탭에서 구글시트 동기화를 먼저 해주세요.
        </div>
      )}

      {/* 피벗 테이블 */}
      {visibleClasses.length > 0 && (
        <div className="card overflow-x-auto mb-4">
          <div className="py-2 px-3 border-b border-slate-100 space-y-1.5">
            <div className="text-xs font-semibold text-slate-600">
              {retreat.year}년 {bu} 전체 학생 명단
              <span className={`ml-2 ${isGreen ? "text-green-600" : "text-purple-600"}`}>■ = {bu} 신청자</span>
            </div>
            <div className="flex flex-wrap items-center gap-1 sm:gap-2 text-xs text-slate-500">
              <span className="text-slate-400 hidden sm:inline">클릭 → 색 변경:</span>
              {CELL_COLORS.map(c => (
                <span key={c} className={`px-1 sm:px-1.5 py-0.5 rounded border font-medium text-[10px] sm:text-xs ${COLOR_CLASSES[c]}`}>
                  {COLOR_LABELS[c]}
                </span>
              ))}
            </div>
          </div>
          <table className="text-xs border-collapse">
            <thead>
              {/* 학년 헤더 */}
              <tr className="bg-slate-100">
                <th className="border border-slate-200 px-2 py-1.5 text-slate-500 text-center w-8">학년</th>
                {grades.map(grade => {
                  const cnt = visibleClasses.filter(c => c.grade === grade).length;
                  return (
                    <th key={grade} colSpan={cnt}
                      className="border border-slate-200 px-2 py-1.5 text-slate-700 font-bold text-center">
                      {grade}학년
                    </th>
                  );
                })}
              </tr>
              {/* 반 헤더 */}
              <tr className="bg-slate-50">
                <th className="border border-slate-200 px-2 py-1 text-slate-400 text-center font-normal">반</th>
                {visibleClasses.map(cls => (
                  <th key={`r-${cls.buNum}-${cls.grade}-${cls.classNum}`}
                    className="border border-slate-200 px-1 py-1 text-slate-600 font-semibold text-center min-w-[48px] sm:min-w-[64px]">
                    {cls.classNum}반
                  </th>
                ))}
              </tr>
              {/* 담임 헤더 */}
              <tr className="bg-slate-50">
                <th className="border border-slate-200 px-2 py-1 text-slate-400 text-center font-normal">담임</th>
                {visibleClasses.map(cls => (
                  <th key={`t-${cls.buNum}-${cls.grade}-${cls.classNum}`}
                    className="border border-slate-200 px-1 py-1 text-slate-500 font-normal text-center">
                    {cls.teacher || "—"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxRows }).map((_, rowIdx) => (
                <tr key={rowIdx}>
                  <td className="border border-slate-100 px-2 py-0.5 text-center text-slate-400 bg-slate-50">
                    {rowIdx + 1}
                  </td>
                  {regularClasses.map(cls => renderCell(cls, cls.students[rowIdx], rowIdx, "reg"))}
                </tr>
              ))}
              {hasJang && (
                <>
                  <tr>
                    <td colSpan={visibleClasses.length + 1}
                      className="border border-slate-200 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700 text-left">
                      장결자 명단 <span className="font-normal text-amber-600">(평시 미출석 — 집계 제외)</span>
                    </td>
                  </tr>
                  {Array.from({ length: jangMaxRows }).map((_, rowIdx) => (
                    <tr key={`jang-${rowIdx}`}>
                      <td className="border border-slate-100 px-2 py-0.5 text-center text-slate-400 bg-slate-50">
                        {rowIdx + 1}
                      </td>
                      {jangClasses.map(cls => renderCell(cls, cls.students[rowIdx], rowIdx, "jang"))}
                    </tr>
                  ))}
                </>
              )}
            </tbody>
            {/* 하단 통계 */}
            <tfoot>
              <tr className="bg-slate-50">
                <td className="border border-slate-200 px-2 py-1 text-slate-500 text-center text-xs">신청자</td>
                {regularClasses.map(cls => {
                  const formParts = cls.students.filter(s => participantByStudentId.has(s.id));
                  const cancelled = formParts.filter(s => cellColors[`${cls.buNum}_${s.id}`] === "red").length;
                  const lateInClass = cls.students.filter(s => {
                    if (participantByStudentId.has(s.id)) return false;
                    const color = cellColors[`${cls.buNum}_${s.id}`];
                    return !!color && LATE_REGISTRANT_COLORS.has(color);
                  }).length;
                  const cnt = formParts.length - cancelled + lateInClass;
                  return (
                    <td key={`cs-${cls.buNum}-${cls.grade}-${cls.classNum}`}
                      className={`border border-slate-200 px-1 py-1 text-center ${cnt > 0 ? statActive : cancelled > 0 ? "text-red-400" : "text-slate-300"}`}>
                      {formParts.length === 0 && lateInClass === 0 ? "—" : cnt > 0 ? cnt : "—"}
                    </td>
                  );
                })}
              </tr>
              <tr className="bg-slate-50">
                <td className="border border-slate-200 px-2 py-1 text-slate-400 text-center text-xs">총원</td>
                {regularClasses.map(cls => (
                  <td key={`ct-${cls.buNum}-${cls.grade}-${cls.classNum}`}
                    className="border border-slate-200 px-1 py-1 text-center text-slate-400">
                    {cls.students.length}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* DB 미매칭 신청자 */}
      {unmatchedParts.length > 0 && (
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-500 mb-2">
            DB 미매칭 {bu} 신청자
            <span className="text-slate-400 font-normal ml-1">({unmatchedParts.length}명 — 표에 미표시)</span>
          </h3>
          <div className="card p-3 flex flex-wrap gap-1">
            {unmatchedParts.map((p) => (
              <span key={p.studentId ?? p.name} className="text-xs bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded border border-yellow-100">
                {p.name}{p.grade > 0 ? ` ${p.grade}학년` : ""}{p.class > 0 ? ` ${p.class}반` : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 중복 신청자 */}
      {duplicateParts.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-500 mb-2">
            중복 신청자
            <span className="text-slate-400 font-normal ml-1">({duplicateParts.length}명)</span>
          </h3>
          <div className="card p-3 flex flex-wrap gap-1">
            {duplicateParts.map((d) => (
              <span key={d.name} className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded border border-orange-100">
                {d.name}{d.grade > 0 ? ` ${d.grade}학년` : ""}{d.cls > 0 ? ` ${d.cls}반` : ""}
                <span className="ml-1 font-bold">{d.count}회</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
