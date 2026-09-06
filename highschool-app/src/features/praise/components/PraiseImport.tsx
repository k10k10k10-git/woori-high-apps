"use client";
import { useMemo, useState } from "react";
import { fieldsFor, guessMapping, validateMappedRows, type ImportKind, type ImportMapping, type RawRow, type StaffImportRow, type StudentImportRow } from "../domain/imports";
import type { PraisePersonInput } from "../types";
import { assertPraiseId } from "../paths";
import { Empty, type PraiseEditorProps } from "./shared";

export function PraiseImport({ view, execute, busy }: PraiseEditorProps) {
  const [kind, setKind] = useState<ImportKind>("STUDENTS");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [checksum, setChecksum] = useState("");
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [acknowledge, setAcknowledge] = useState(false);
  const [saved, setSaved] = useState(false);
  const preview = useMemo(() => validateMappedRows(kind, rawRows, mapping), [kind, rawRows, mapping]);
  const compatibilityErrors = preview.rows.flatMap((row, index) => {
    const issues: string[] = [];
    if (row.name.length > 80) issues.push(`${index + 1}번째 검증 행: 이름은 80자 이하여야 합니다.`);
    if ("internalCode" in row && row.internalCode) { try { assertPraiseId(row.internalCode); } catch { issues.push(`${index + 1}번째 검증 행: 내부 ID는 영문·숫자·밑줄·하이픈 128자 이내로 입력해 주세요.`); } }
    return issues;
  });
  const targetCounts = Object.values(mapping).filter(Boolean);
  if (new Set(targetCounts).size !== targetCounts.length) compatibilityErrors.push("같은 항목에 여러 파일 열을 연결했습니다. 항목마다 하나의 열만 연결해 주세요.");
  const duplicates = preview.rows.filter((row) => view.people.some((person) => person.name.replaceAll(/\s/g, "") === row.name.replaceAll(/\s/g, "") && person.kind === (kind === "STUDENTS" ? "STUDENT" : "STAFF")));
  const normalizedNames = preview.rows.map((row) => row.name.replaceAll(/\s/g, ""));
  if (new Set(normalizedNames).size !== normalizedNames.length || duplicates.length > 0) compatibilityErrors.push("같은 이름의 팀원은 일괄 등록할 수 없습니다. 기존 팀원과 인물을 확인한 뒤 개별 등록해 주세요.");
  const readFile = async (file?: File) => {
    setError(""); setSaved(false); setAcknowledge(false); setRawRows([]); setHeaders([]); setChecksum("");
    if (!file) return;
    if (!/\.(csv|xlsx)$/i.test(file.name) || file.size > 10 * 1024 * 1024) { setError("10MB 이하의 CSV 또는 XLSX 파일을 선택해 주세요."); return; }
    setReading(true);
    try {
      const buffer = await file.arrayBuffer();
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "array", cellDates: false, cellFormula: false });
      if (!workbook.SheetNames.length) throw new Error("시트를 찾지 못했습니다.");
      const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: "", blankrows: false });
      const first = rows[0]?.map((value) => String(value).trim()) ?? [];
      if (first.length === 0 || first.length > 50 || first.some((header) => !header) || new Set(first).size !== first.length) throw new Error("첫 행의 열 이름은 비어 있지 않고 서로 달라야 하며, 50개 이하여야 합니다.");
      if (rows.length < 2 || rows.length > 1001) throw new Error("가져올 명단은 1~1,000행으로 준비해 주세요.");
      const digest = await crypto.subtle.digest("SHA-256", buffer);
      setChecksum(Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join(""));
      setFileName(file.name); setHeaders(first); setMapping(guessMapping(first, kind)); setRawRows(rows.slice(1).map((row) => Object.fromEntries(first.map((header, index) => [header, row[index] ?? ""]))));
    } catch (failure) { setError(failure instanceof Error ? failure.message : "파일을 읽지 못했습니다."); }
    finally { setReading(false); }
  };
  const save = async () => {
    const people: PraisePersonInput[] = preview.rows.map((row) => {
      const base: PraisePersonInput = { id: crypto.randomUUID(), kind: kind === "STUDENTS" ? "STUDENT" : "STAFF", name: row.name, gender: row.gender, grade: 0, department: "FIRST", team: "SINGER", active: row.active, isStudentLeader: false, singerCapable: true, groupStaffCapable: false, preferredService: "BOTH", excludeFromAutoSinger: false };
      if (kind === "STUDENTS") { const student = row as StudentImportRow; return { ...base, grade: student.grade, department: student.serviceDepartment, team: student.team, isStudentLeader: student.isStudentLeader, ...(student.internalCode ? { sourceId: student.internalCode } : {}) }; }
      const staff = row as StaffImportRow; return { ...base, singerCapable: staff.singerCapable, groupStaffCapable: staff.groupLeaderCapable, preferredService: staff.preferredService, excludeFromAutoSinger: staff.excludeFromAutoSinger, team: staff.defaultStageRole };
    });
    if (await execute({ type: "people.import", people, checksum, source: `${kind === "STUDENTS" ? "학생" : "스탭"} 명단 ${fileName.toLowerCase().endsWith(".csv") ? "CSV" : "XLSX"}` })) { setSaved(true); setRawRows([]); setHeaders([]); setFileName(""); }
  };
  return <section className="praise-section"><div className="praise-section-heading"><div><h2>명단 가져오기</h2><p>파일의 첫 시트를 읽어 열 연결과 오류를 확인한 뒤 새 팀원으로 등록합니다.</p></div></div><p className="praise-note">기존 팀원을 이름으로 덮어쓰지 않습니다. 이전 시스템의 출결·확정 이력 이관은 별도의 검증된 이관 절차를 사용해 주세요. 이메일·비고 등 이 화면에서 지원하지 않는 항목은 등록하지 않습니다.</p>
    <div className="praise-toolbar"><label className="praise-field"><span>명단 구분</span><select value={kind} disabled={reading || busy} onChange={(event) => { const next = event.target.value as ImportKind; setKind(next); setMapping(guessMapping(headers, next)); setAcknowledge(false); }}><option value="STUDENTS">학생</option><option value="STAFF">스탭</option></select></label><label className="praise-field"><span>CSV · XLSX 파일</span><input type="file" accept=".csv,.xlsx" disabled={reading || busy} onChange={(event) => { void readFile(event.target.files?.[0]); event.target.value = ""; }} /></label></div>
    {reading && <p role="status">파일을 분석하고 있습니다…</p>}{error && <p className="praise-error" role="alert">{error}</p>}{saved && <p role="status" className="praise-note">명단을 등록했습니다. 팀원 목록에서 확인해 주세요.</p>}
    {headers.length === 0 ? <Empty>열 이름이 있는 파일을 선택해 주세요. 학생: 이름·학년·성별·예배 부서·팀 / 스탭: 이름·성별.</Empty> : <><h3>파일 열 연결</h3><div className="praise-form-grid">{headers.map((header) => <label key={header} className="praise-field"><span>{header}</span><select value={mapping[header] ?? ""} onChange={(event) => { setMapping((current) => ({ ...current, [header]: event.target.value })); setAcknowledge(false); }}><option value="">가져오지 않음</option>{fieldsFor(kind).map((field) => <option key={field.key} value={field.key}>{field.label}{field.required ? " (필수)" : ""}</option>)}</select></label>)}</div>
      <div className="praise-toolbar"><strong>검증된 {preview.rows.length}명</strong><span>오류 {preview.errors.length + compatibilityErrors.length}건 · 주의 {preview.warnings.length + duplicates.length}건</span></div>
      {compatibilityErrors.length > 0 && <div className="praise-error" role="alert"><ul>{compatibilityErrors.slice(0, 20).map((issue, index) => <li key={index}>{issue}</li>)}</ul></div>}
      {preview.errors.length > 0 && <div className="praise-error" role="alert"><strong>파일을 수정하거나 열 연결을 확인해 주세요.</strong><ul>{preview.errors.slice(0, 20).map((issue, index) => <li key={index}>{issue.row}행 · {issue.message}</li>)}</ul>{preview.errors.length > 20 && <p>추가 오류 {preview.errors.length - 20}건</p>}</div>}
      {(preview.warnings.length > 0 || duplicates.length > 0) && <div className="praise-warning"><ul>{preview.warnings.slice(0, 10).map((issue, index) => <li key={index}>{issue.row}행 · {issue.message}</li>)}{duplicates.length > 0 && <li>이미 등록된 팀원과 이름이 같은 명단 {duplicates.length}명입니다. 같은 사람이면 이 파일에서 제외하고 기존 팀원을 수정해 주세요.</li>}</ul></div>}
      <div className="praise-table-wrap"><table className="praise-table"><thead><tr><th>이름</th><th>성별</th><th>{kind === "STUDENTS" ? "학년·예배·팀" : "역할"}</th><th>상태</th></tr></thead><tbody>{preview.rows.slice(0, 100).map((row, index) => <tr key={index}><td>{row.name}</td><td>{row.gender === "FEMALE" ? "여" : "남"}</td><td>{"grade" in row ? `${row.grade}학년 · ${row.serviceDepartment === "FIRST" ? "1부" : "2부"} · ${row.team === "SINGER" ? "싱어" : "세션"}` : row.defaultStageRole === "SINGER" ? "싱어" : "세션"}</td><td>{row.active ? "활동 중" : "비활성"}</td></tr>)}</tbody></table></div>{preview.rows.length > 100 && <p className="praise-note">미리보기는 앞 100명입니다. 저장 시 검증된 {preview.rows.length}명을 모두 등록합니다.</p>}
      <label className="praise-check"><input type="checkbox" checked={acknowledge} onChange={(event) => setAcknowledge(event.target.checked)} />열 연결과 중복 주의 사항을 확인했습니다</label><button className="praise-button praise-button--primary" disabled={busy || reading || !acknowledge || preview.errors.length > 0 || compatibilityErrors.length > 0 || preview.rows.length === 0 || !checksum} onClick={() => { void save(); }}>검증된 {preview.rows.length}명 등록</button>
    </>}
  </section>;
}
