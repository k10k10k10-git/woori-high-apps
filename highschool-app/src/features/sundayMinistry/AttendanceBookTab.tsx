"use client";

import { useEffect, useMemo, useState } from "react";
import LoadFailureNotice from "@/components/LoadFailureNotice";
import {
  subscribeToAttendanceByYear,
  subscribeToAttendanceEventsByYear,
  subscribeToClassesByYear,
  type AttendanceEventRecord,
} from "@/lib/db/students";
import { useLoadErrors } from "@/lib/useLoadErrors";
import {
  attendanceSummary, attendanceWeeks, classKeysForPart, classLabel,
  latestAttendanceWeek, normalizeAttendanceMark, sortedRoster, weeklyAttendanceCounts,
  type AttendanceSemester,
} from "./attendanceBook";
import styles from "./sundayAdmin.module.css";

type ClassesYear = Record<string, {
  teacher?: string;
  students?: Record<string, { name: string; num?: number; phone?: string; jang?: boolean }>;
}>;
type AttendanceYear = Record<string, Record<string, Record<string, string>>>;
const MARK_LABEL: Record<string, string> = { O: "출석", X: "결석" };

export default function AttendanceBookTab({ year = new Date().getFullYear() }: { year?: number }) {
  return <AttendanceBookYear key={year} year={year} />;
}

function AttendanceBookYear({ year }: { year: number }) {
  const [attempt, setAttempt] = useState(0);
  // 연도·재시도 범위가 바뀌면 이전 명단과 구독 응답을 함께 폐기한다.
  return <AttendanceBookContent key={attempt} year={year} onRetry={() => setAttempt((value) => value + 1)} />;
}

function AttendanceBookContent({ year, onRetry }: { year: number; onRetry: () => void }) {
  const [semester, setSemester] = useState<AttendanceSemester>("all");
  const [view, setView] = useState<"week" | "history">("week");
  const [part, setPart] = useState<1 | 2>(1);
  const [pickedClassKey, setPickedClassKey] = useState("");
  const [pickedWeek, setPickedWeek] = useState("");
  const [query, setQuery] = useState("");
  const [classes, setClasses] = useState<ClassesYear>({});
  const [attendance, setAttendance] = useState<AttendanceYear>({});
  const [events, setEvents] = useState<Record<string, AttendanceEventRecord>>({});
  const [loaded, setLoaded] = useState<string[]>([]);
  const { fail, ok, errors, message: loadError } = useLoadErrors(`sunday-attendance|${year}`);

  useEffect(() => {
    let active = true;
    const received = <T,>(key: string, setValue: (value: T) => void) => (value: T) => {
      if (!active) return;
      setValue(value);
      setLoaded((values) => values.includes(key) ? values : [...values, key]);
      ok(key);
    };
    const failure = (key: string) => (error: Error) => { if (active) fail(key)(error); };
    const unsubs = [
      subscribeToClassesByYear(year, received("반·학생 명단", setClasses), failure("반·학생 명단")),
      subscribeToAttendanceByYear(year, received("출석 기록", setAttendance), failure("출석 기록")),
      subscribeToAttendanceEventsByYear(year, received("출석 일정", setEvents), failure("출석 일정")),
    ];
    return () => { active = false; unsubs.forEach((unsubscribe) => unsubscribe()); };
  }, [fail, ok, year]);

  const classKeys = useMemo(() => classKeysForPart(Object.keys(classes), part), [classes, part]);
  const selectedClassKey = classKeys.includes(pickedClassKey) ? pickedClassKey : (classKeys[0] ?? "");
  const selectedClass = classes[selectedClassKey];
  const roster = useMemo(() => sortedRoster(selectedClass?.students), [selectedClass]);
  const visibleRoster = roster.filter(([, student]) => student.name.replace(/\s+/g, "").includes(query.replace(/\s+/g, "")));
  const allWeeks = useMemo(() => attendanceWeeks(year, "all", events), [events, year]);
  const normalWeeks = allWeeks.filter((week) => !week.label);
  const selectedWeek = normalWeeks.find((week) => week.cellKey === pickedWeek) ?? latestAttendanceWeek(year, allWeeks);
  const weeks = useMemo(() => attendanceWeeks(year, semester, events), [events, semester, year]);
  const counts = selectedWeek ? weeklyAttendanceCounts(selectedClass?.students, attendance[selectedClassKey], selectedWeek.cellKey) : null;

  return (
    <section className={`sunday-attendance-book surface-panel ${styles.attendanceBook}`}>
      <div className="sunday-attendance-toolbar">
        <div className="sunday-attendance-filters">
          <div className="sunday-attendance-segment" role="group" aria-label="출석부 보기">
            <button type="button" aria-pressed={view === "week"} onClick={() => setView("week")}>주일별 보기</button>
            <button type="button" aria-pressed={view === "history"} onClick={() => setView("history")}>누적표</button>
          </div>
          <div className="sunday-attendance-segment" role="group" aria-label="부 선택">
            <button type="button" aria-pressed={part === 1} onClick={() => { setPart(1); setPickedClassKey(""); }}>1부</button>
            <button type="button" aria-pressed={part === 2} onClick={() => { setPart(2); setPickedClassKey(""); }}>2부</button>
          </div>
          {view === "week" ? <label><span>주일</span><select className="form-control" aria-label="출석 조회 주일" value={selectedWeek?.cellKey ?? ""} onChange={(event) => setPickedWeek(event.target.value)}>
            {normalWeeks.map((week) => <option key={week.cellKey} value={week.cellKey}>{week.month}월 {week.day}일</option>)}
          </select></label> : <label><span>기간</span><select className="form-control" aria-label="누적표 기간" value={semester} onChange={(event) => setSemester(event.target.value as AttendanceSemester)}><option value="all">1년 전체</option><option value="first">1학기</option><option value="second">2학기</option></select></label>}
          <label className="sunday-attendance-class-select"><span>반</span><select className="form-control" aria-label="출석 조회 반" value={selectedClassKey} onChange={(event) => setPickedClassKey(event.target.value)}>
            {classKeys.length === 0 && <option value="">등록된 반 없음</option>}
            {classKeys.map((classKey) => <option key={classKey} value={classKey}>{classLabel(classKey)}</option>)}
          </select></label>
        </div>
        <a className="btn-secondary btn-sm sunday-attendance-source-link" href="https://woori-high.web.app/attendance" target="_blank" rel="noreferrer">원본 출석부에서 수정 <span aria-hidden="true">↗</span></a>
      </div>

      {loadError ? <div className={styles.notice}><LoadFailureNotice title="출석부를 불러오지 못했습니다." sources={Object.keys(errors)} onRetry={onRetry} /></div>
        : loaded.length < 3 ? <p className={styles.empty} role="status">{year}년 출석부를 불러오고 있습니다…</p>
          : !selectedClassKey ? <p className={styles.empty}>{year}년 {part}부 반 명단이 없습니다.</p>
            : <>
              <div className={styles.rosterHeader}>
                <div><h3>{classLabel(selectedClassKey)}</h3><p>담당 {selectedClass?.teacher?.trim() || "미입력"} · 학생 {roster.length}명</p></div>
                <label><span className="sr-only">학생 이름 검색</span><input className="form-control" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="학생 이름 검색" /></label>
              </div>

              {view === "week" ? <>
                {selectedWeek && counts ? <>
                  <div className={styles.weekSummary}><strong>{selectedWeek.month}월 {selectedWeek.day}일</strong><span>입력 대상 {counts.target}명</span><span>기록된 학생 {counts.recorded}명</span><span className={counts.unentered ? styles.pending : ""}>미입력 학생 {counts.unentered}명</span><small>장결자는 입력 대상에서 제외</small></div>
                  <ul className={styles.weekRoster} aria-label="선택한 주일의 학생 출석">
                    {visibleRoster.map(([studentId, student]) => {
                      const mark = normalizeAttendanceMark(attendance[selectedClassKey]?.[studentId]?.[selectedWeek.cellKey]);
                      return <li key={studentId}><span><strong>{student.name}</strong>{student.jang && <small>장결</small>}</span><span className={mark === "O" ? styles.present : mark === "X" ? styles.absent : styles.pending}>{MARK_LABEL[mark] ?? "미입력"}</span></li>;
                    })}
                  </ul>
                </> : <p className={styles.empty}>조회할 정상 주일이 없습니다.</p>}
              </> : <>
                <div className="sunday-attendance-table-wrap" tabIndex={0} aria-label={`${classLabel(selectedClassKey)} 누적 출석표, 좌우로 스크롤할 수 있습니다`}>
                  <table className="sunday-attendance-table"><caption className="sr-only">{year}년 {classLabel(selectedClassKey)} 누적 출석</caption>
                    <thead><tr><th className="is-sticky is-number">No.</th><th className="is-sticky is-name">이름</th>{weeks.map((week) => <th key={week.cellKey} title={week.label}>{week.month}/{week.day}{week.label && <small>{week.label}</small>}</th>)}<th>출석/기록</th><th>출석률</th></tr></thead>
                    <tbody>{visibleRoster.map(([studentId, student], index) => {
                      const record = attendance[selectedClassKey]?.[studentId];
                      const summary = attendanceSummary(record, weeks);
                      return <tr key={studentId}><td className="is-sticky is-number">{student.num ?? index + 1}</td><th scope="row" className="is-sticky is-name">{student.name}{student.jang && <small>장결</small>}</th>{weeks.map((week) => {
                        const mark = normalizeAttendanceMark(record?.[week.cellKey]);
                        return <td key={week.cellKey} className={week.label ? "is-event" : (mark ? `mark-${mark.toLowerCase()}` : "")}>{week.label ? "휴" : mark === "O" ? "출" : mark === "X" ? "결" : "·"}</td>;
                      })}<td>{summary.present}/{summary.recorded}</td><td>{summary.rate === null ? "-" : `${summary.rate}%`}</td></tr>;
                    })}</tbody>
                  </table>
                </div>
                <div className="sunday-attendance-legend" aria-label="출석 표시 안내"><span className="mark-o">출 · 출석</span><span className="mark-x">결 · 결석</span><span>· 미입력</span><span className="is-event">휴 · 행사·휴일</span></div>
              </>}
              {visibleRoster.length === 0 && <p className={styles.empty}>{roster.length === 0 ? "등록된 학생이 없습니다." : "검색 결과가 없습니다."}</p>}
            </>}
    </section>
  );
}
