"use client";

import { useEffect, useMemo, useState } from "react";
import {
  subscribeToAttendanceByYear,
  subscribeToAttendanceEventsByYear,
  subscribeToClassesByYear,
  type AttendanceEventRecord,
} from "@/lib/db/students";
import { useLoadErrors } from "@/lib/useLoadErrors";
import {
  attendanceSummary,
  attendanceWeeks,
  classKeysForPart,
  classLabel,
  sortedRoster,
  type AttendanceSemester,
} from "./attendanceBook";

type ClassesYear = Record<string, {
  teacher?: string;
  students?: Record<string, { name: string; num?: number; phone?: string; jang?: boolean }>;
}>;
type AttendanceYear = Record<string, Record<string, Record<string, string>>>;

const MARK_LABEL: Record<string, string> = { O: "출", T: "지", X: "결" };

export default function AttendanceBookTab() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const [year, setYear] = useState(currentYear);
  const [semester, setSemester] = useState<AttendanceSemester>(today.getMonth() < 6 ? "first" : "second");
  const [part, setPart] = useState<1 | 2>(1);
  const [pickedClassKey, setPickedClassKey] = useState("");
  const [classes, setClasses] = useState<ClassesYear>({});
  const [attendance, setAttendance] = useState<AttendanceYear>({});
  const [events, setEvents] = useState<Record<string, AttendanceEventRecord>>({});
  const { fail, ok, message: loadError } = useLoadErrors(`sunday-attendance|${year}`);

  useEffect(() => {
    const unsubs = [
      subscribeToClassesByYear(year, (value) => { setClasses(value); ok("반·학생 명단"); }, fail("반·학생 명단")),
      subscribeToAttendanceByYear(year, (value) => { setAttendance(value); ok("출석 기록"); }, fail("출석 기록")),
      subscribeToAttendanceEventsByYear(year, (value) => { setEvents(value); ok("출석 일정"); }, fail("출석 일정")),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [fail, ok, year]);

  const years = useMemo(() => Array.from({ length: 11 }, (_, index) => currentYear - 5 + index), [currentYear]);
  const classKeys = useMemo(() => classKeysForPart(Object.keys(classes), part), [classes, part]);
  const selectedClassKey = classKeys.includes(pickedClassKey) ? pickedClassKey : (classKeys[0] ?? "");
  const selectedClass = classes[selectedClassKey];
  const roster = useMemo(() => sortedRoster(selectedClass?.students), [selectedClass]);
  const weeks = useMemo(() => attendanceWeeks(year, semester, events), [events, semester, year]);
  const summaries = useMemo(() => roster.map(([studentId]) => attendanceSummary(attendance[selectedClassKey]?.[studentId], weeks)), [attendance, roster, selectedClassKey, weeks]);
  const totalRecorded = summaries.reduce((sum, item) => sum + item.recorded, 0);
  const averageRate = totalRecorded === 0
    ? null
    : Math.round((summaries.reduce((sum, item) => sum + item.present, 0) / totalRecorded) * 100);

  return (
    <section className="sunday-attendance-book surface-panel">
      <div className="sunday-attendance-toolbar">
        <div className="sunday-attendance-filters">
          <label>
            <span>연도</span>
            <select className="form-control" value={year} onChange={(event) => { setYear(Number(event.target.value)); setPickedClassKey(""); }}>
              {years.map((value) => <option key={value} value={value}>{value}년</option>)}
            </select>
          </label>
          <div className="sunday-attendance-segment" role="group" aria-label="학기 선택">
            <button type="button" aria-pressed={semester === "first"} onClick={() => setSemester("first")}>1학기</button>
            <button type="button" aria-pressed={semester === "second"} onClick={() => setSemester("second")}>2학기</button>
          </div>
          <div className="sunday-attendance-segment" role="group" aria-label="부서 선택">
            <button type="button" aria-pressed={part === 1} onClick={() => { setPart(1); setPickedClassKey(""); }}>1부</button>
            <button type="button" aria-pressed={part === 2} onClick={() => { setPart(2); setPickedClassKey(""); }}>2부</button>
          </div>
          <label className="sunday-attendance-class-select">
            <span>반</span>
            <select className="form-control" value={selectedClassKey} onChange={(event) => setPickedClassKey(event.target.value)}>
              {classKeys.length === 0 && <option value="">등록된 반 없음</option>}
              {classKeys.map((classKey) => <option key={classKey} value={classKey}>{classLabel(classKey)}</option>)}
            </select>
          </label>
        </div>
        <a className="btn-secondary btn-sm sunday-attendance-source-link" href="https://woori-high.web.app/attendance" target="_blank" rel="noreferrer">
          원본 출석부에서 수정 <span aria-hidden="true">↗</span>
        </a>
      </div>

      {loadError && <div className="sunday-attendance-error" role="alert">출석부를 불러오지 못했습니다. {loadError}</div>}

      {selectedClassKey ? (
        <>
          <div className="sunday-attendance-summary">
            <div>
              <span>선택한 반</span>
              <strong>{classLabel(selectedClassKey)}</strong>
              <p>담당 {selectedClass?.teacher?.trim() || "미입력"}</p>
            </div>
            <dl>
              <div><dt>학생</dt><dd>{roster.length}명</dd></div>
              <div><dt>평균 출석률</dt><dd>{averageRate === null ? "-" : `${averageRate}%`}</dd></div>
              <div><dt>기록 주차</dt><dd>{weeks.filter((week) => !week.label).length}주</dd></div>
            </dl>
          </div>

          <div className="sunday-attendance-table-wrap" tabIndex={0} aria-label={`${classLabel(selectedClassKey)} 출석표, 좌우로 스크롤할 수 있습니다`}>
            <table className="sunday-attendance-table">
              <thead>
                <tr>
                  <th className="is-sticky is-number">No.</th>
                  <th className="is-sticky is-name">이름</th>
                  {weeks.map((week) => <th key={week.cellKey} title={week.label}>{week.month}/{week.day}{week.label && <small>{week.label}</small>}</th>)}
                  <th>출석/기록</th>
                  <th>출석률</th>
                </tr>
              </thead>
              <tbody>
                {roster.map(([studentId, student], index) => {
                  const summary = summaries[index];
                  const record = attendance[selectedClassKey]?.[studentId];
                  return (
                    <tr key={studentId}>
                      <td className="is-sticky is-number">{student.num ?? index + 1}</td>
                      <th scope="row" className="is-sticky is-name">{student.name}{student.jang && <small>장결</small>}</th>
                      {weeks.map((week) => {
                        const mark = record?.[week.cellKey] ?? "";
                        return <td key={week.cellKey} className={week.label ? "is-event" : (mark ? `mark-${mark.toLowerCase()}` : "")}>{week.label ? "휴" : (MARK_LABEL[mark] ?? "·")}</td>;
                      })}
                      <td>{summary.present}/{summary.recorded}</td>
                      <td><strong>{summary.rate === null ? "-" : `${summary.rate}%`}</strong></td>
                    </tr>
                  );
                })}
                {roster.length === 0 && <tr><td colSpan={weeks.length + 4} className="sunday-attendance-empty">등록된 학생이 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="sunday-attendance-legend" aria-label="출석 표시 안내"><span className="mark-o">출 · 출석</span><span className="mark-t">지 · 지각</span><span className="mark-x">결 · 결석</span><span className="is-event">휴 · 행사·휴일</span></div>
        </>
      ) : (
        <div className="sunday-attendance-empty-state">{year}년 {part}부 반 명단이 없습니다.</div>
      )}
    </section>
  );
}
