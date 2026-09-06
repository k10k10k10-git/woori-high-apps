"use client";
import { useState } from "react";
import type { PraiseMeeting, PraisePerson, PraiseStatus, PraiseView } from "../types";
import { canEditViewAttendance, canReadPraiseStudentAttendance } from "../permissions";
import { PraiseAuditList } from "./PraiseAuditList";
import { Empty, authorName, hasUnresolvedImportedGroup, latestGroups, praiseDataWriteLocked, stampTime, type PraiseMeetingProps } from "./shared";

type AttendanceProps = PraiseMeetingProps & { onSelectMeeting?: (meetingId: string) => void };

export function PraiseAttendance({ view, meeting, execute, busy, onSelectMeeting }: AttendanceProps) {
  const [display, setDisplay] = useState<"meeting" | "semester">("meeting");
  const [query, setQuery] = useState("");
  const [groupId, setGroupId] = useState("");
  const [selectedKind, setKind] = useState<"STUDENT" | "STAFF">("STUDENT");
  const [missingOnly, setMissingOnly] = useState(false);
  const canReadStudents = canReadPraiseStudentAttendance(view.permissions);
  const kind = canReadStudents ? selectedKind : "STAFF";
  const groupVersion = latestGroups(view, meeting);
  const unresolvedGroup = hasUnresolvedImportedGroup(view, meeting);
  if (!meeting) return <Empty>운영 설정에서 모임 회차를 추가하면 출결을 기록할 수 있습니다.</Empty>;
  const records = view.attendance[meeting.id] ?? {};
  const staffRecords = view.availability[meeting.id] ?? {};
  const rows = view.people.filter((person) => person.active && person.kind === kind && person.name.replaceAll(" ", "").toLocaleLowerCase().includes(query.replaceAll(" ", "").toLocaleLowerCase()) && (!groupId || groupVersion?.groups.find((group) => group.id === groupId)?.[kind === "STUDENT" ? "studentIds" : "staffIds"].includes(person.id)) && (kind === "STUDENT" ? canEditViewAttendance(view, meeting.id, person.id) : view.permissions.stageEdit || person.id === view.permissions.staffId) && (!missingOnly || (kind === "STUDENT" ? !meeting.cancelled && (Boolean(records[person.id]) || view.permissions.attendanceAll) && records[person.id]?.status == null : staffRecords[person.id]?.present == null)));

  const meetings = [...view.meetings].sort((a, b) => a.date.localeCompare(b.date) || a.sequence - b.sequence);
  const usedGroupVersions = new Set([...meetings.map((item) => latestGroups(view, item)?.id), ...Object.values(view.attendance).flatMap((records) => Object.values(records).map((record) => record.groupVersionId))]);
  const semesterGroups = [...new Map(view.groups.filter((version) => version.kind === "CONFIRMED" && usedGroupVersions.has(version.id)).flatMap((version) => version.groups).map((group) => [group.id, group])).values()];
  const semesterRows = display === "semester" ? view.people.filter((person) => person.kind === kind && person.name.replaceAll(" ", "").toLocaleLowerCase().includes(query.replaceAll(" ", "").toLocaleLowerCase())).map((person) => ({ person, cells: meetings.map((item) => attendanceCell(view, item, person, groupId)) })).filter(({ cells }) => cells.some((cell) => cell.visible) && (!missingOnly || cells.some((cell) => cell.missing))) : [];
  const openMeeting = (id: string, personId?: string) => {
    if (!onSelectMeeting || busy) return;
    const target = view.meetings.find((item) => item.id === id);
    const targetGroup = latestGroups(view, target)?.groups.find((item) => item.id === groupId);
    if (!targetGroup || (personId && !targetGroup[kind === "STUDENT" ? "studentIds" : "staffIds"].includes(personId))) setGroupId("");
    setMissingOnly(false);
    onSelectMeeting(id);
    setDisplay("meeting");
  };
  return <section className="praise-section" aria-label="찬양팀 출결">
    <div className="praise-section-heading"><div><h2>{display === "meeting" ? "모임 출결" : "학기 전체 출결"}</h2><p>{display === "meeting" ? `${kind === "STUDENT" ? meeting.date : meeting.worshipDate} · ${kind === "STAFF" ? "주일 스탭 참석 · " : ""}${meeting.title}${meeting.cancelled ? " · 학생 휴강" : ""}` : `${view.meta.startDate} ~ ${view.meta.endDate} · ${meetings.length}개 회차`}</p></div><span className="praise-badge">{view.permissions.attendanceAll ? "전체 팀원" : kind === "STUDENT" ? "내 담당 조" : "스탭 참석"}</span></div>
    <div className="praise-segment" aria-label="출결 보기"><button type="button" aria-pressed={display === "meeting"} onClick={() => setDisplay("meeting")}>모임별 입력</button><button type="button" aria-pressed={display === "semester"} onClick={() => setDisplay("semester")}>학기 전체 표</button></div>
    {display === "meeting" && meeting.cancelled && <p className="praise-warning">학생 모임 휴강 회차입니다. 학생 출결은 잠겨 있으며 주일 스탭 참석은 기록할 수 있습니다.</p>}
    {display === "meeting" && meeting.linkedSessionId && <p className="praise-note">공통 출석 원장과 연결된 모임입니다. 학기 사역팀 출석 화면에서 기록해 주세요.</p>}
    {display === "meeting" && !groupVersion && <p className="praise-note">{unresolvedGroup ? "원본에 출석 당시 조편성이 연결되어 있지 않습니다. 출결은 원본대로 표시하며 과거 조는 확인이 필요합니다." : "확정된 조편성이 없습니다. 조 담당 스탭은 조가 확정된 뒤 담당 학생의 출결을 기록할 수 있습니다."}</p>}
    <div className="praise-toolbar">
      <label className="praise-search"><span className="sr-only">출결 이름 검색</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름으로 검색" /></label>
      <label className="praise-field"><span className="sr-only">출결 조 선택</span><select value={groupId} onChange={(event) => setGroupId(event.target.value)}><option value="">전체 조</option>{(display === "semester" ? semesterGroups : groupVersion?.groups)?.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
      {canReadStudents && <div className="praise-segment" aria-label="출결 대상"><button type="button" aria-pressed={kind === "STUDENT"} onClick={() => { setKind("STUDENT"); setGroupId(""); }}>학생</button><button type="button" aria-pressed={kind === "STAFF"} onClick={() => { setKind("STAFF"); setGroupId(""); }}>스탭</button></div>}
      <label className="praise-check"><input type="checkbox" checked={missingOnly} onChange={(event) => setMissingOnly(event.target.checked)} />미입력만 보기</label>
      <span className="praise-count">{display === "semester" ? semesterRows.length : rows.length}명</span>
    </div>
    {display === "semester" ? <>
      <p className="praise-note" id="praise-semester-attendance-help">회차나 기록을 누르면 모임별 입력으로 이동합니다. 표를 가로로 스크롤해 전체 회차를 확인하세요. {groupId && "선택한 조에 속한 회차만 표시합니다. "}휴강은 학생 모임에만 적용됩니다.</p>
      {!view.permissions.attendanceAll && kind === "STUDENT" && <p className="praise-note">담당했던 조의 기록만 표시합니다. ‘확인할 기록 없음’은 미입력 또는 이전 담당 조의 비공개 기록일 수 있어 출석·결석으로 판단하지 않습니다.</p>}
      {semesterRows.length === 0 ? <Empty>{missingOnly ? "확인 가능한 미입력 기록이 없습니다." : "검색 조건에 맞는 출결 기록이 없습니다."}</Empty> : <div className="praise-table" role="region" aria-label="학기 전체 출결 표 가로 스크롤" aria-describedby="praise-semester-attendance-help" tabIndex={0}><table>
        <caption className="sr-only">{kind === "STUDENT" ? "학생" : "스탭"} 학기 전체 출결 · 기록이 없는 셀은 미입력 또는 확인 제한으로 구분합니다.</caption>
        <thead><tr><th scope="col">이름</th>{meetings.map((item) => <th key={item.id} scope="col">{onSelectMeeting ? <button className="praise-text-button" type="button" disabled={busy} aria-label={`${kind === "STUDENT" ? item.date : item.worshipDate} ${item.title} 모임별 입력 열기`} onClick={() => openMeeting(item.id)}>{kind === "STUDENT" ? item.date : item.worshipDate}</button> : kind === "STUDENT" ? item.date : item.worshipDate}<br /><span>{item.title}{item.cancelled ? " · 학생 휴강" : ""}</span></th>)}</tr></thead>
        <tbody>{semesterRows.map(({ person, cells }) => <tr key={person.id}><th scope="row">{person.name}{!person.active && <small> · 비활성</small>}</th>{cells.map((cell, index) => <td key={meetings[index].id}>{cell.visible && cell.canOpen && person.active && onSelectMeeting ? <button className="praise-text-button" type="button" disabled={busy} title={cell.detail} aria-label={`${person.name} ${kind === "STUDENT" ? meetings[index].date : meetings[index].worshipDate} ${cell.label} · 모임별 입력 열기`} onClick={() => openMeeting(meetings[index].id, person.id)}>{cell.label}</button> : <span title={cell.detail}>{cell.label}</span>}{cell.groupName && <small className="praise-note"><br />{cell.groupName}</small>}</td>)}</tr>)}</tbody>
      </table></div>}
    </> : rows.length === 0 ? <Empty>{query ? "검색 결과가 없습니다. 이름이나 조를 바꿔 주세요." : "표시할 담당 팀원이 없습니다."}</Empty> : <div className="praise-attendance-list">{rows.map((person) => {
      const canEdit = !praiseDataWriteLocked(view) && (kind === "STUDENT" ? !meeting.cancelled && !meeting.linkedSessionId && Boolean(groupVersion?.groups.some((group) => group.studentIds.includes(person.id))) && canEditViewAttendance(view, meeting.id, person.id) : view.permissions.stageEdit || person.id === view.permissions.staffId);
      const record = records[person.id]; const available = staffRecords[person.id];
      const restricted = kind === "STUDENT" && !record && !view.permissions.attendanceAll;
      const status = kind === "STUDENT" ? record?.status ?? null : available?.present != null ? available.present ? "PRESENT" : "ABSENT" : null;
      const stamp = kind === "STUDENT" ? record : available;
      const group = groupVersion?.groups.find((item) => item[kind === "STUDENT" ? "studentIds" : "staffIds"].includes(person.id));
      const setStatus = (next: PraiseStatus | null) => kind === "STUDENT"
        ? execute({ type: "attendance.set", meetingId: meeting.id, personId: person.id, status: next, expectedRevision: record?.revision ?? 0 })
        : execute({ type: "availability.set", meetingId: meeting.id, personId: person.id, present: next === null ? null : next === "PRESENT", role: available?.role ?? (person.singerCapable ? "SINGER" : "SESSION"), expectedRevision: available?.revision ?? 0 });
      return <article className="praise-attendance-row" key={person.id}>
        <div className="praise-person-heading"><strong>{person.name}</strong><span>{kind === "STUDENT" ? `${person.grade}학년 · ${person.team === "SINGER" ? "싱어" : "세션"}` : "스탭"}{group ? ` · ${group.name}` : unresolvedGroup ? " · 과거 조 확인 필요" : " · 조 미배정"}</span>{record?.originalStatus === "LATE" && <small>기존 지각 기록 이관</small>}</div>
        <div className="praise-row-actions"><div className="praise-status-buttons" role="group" aria-label={`${person.name} 출결`}>
          <button type="button" aria-pressed={status === "PRESENT"} disabled={busy || !canEdit || status === "PRESENT"} onClick={() => { void setStatus("PRESENT"); }}>출석</button>
          <button type="button" aria-pressed={status === "ABSENT"} disabled={busy || !canEdit || status === "ABSENT"} onClick={() => { void setStatus("ABSENT"); }}>결석</button>
          {<button type="button" aria-label={restricted ? `${person.name} 출결 확인 필요` : `${person.name} 출결 지우기`} disabled={busy || !canEdit || status === null} onClick={() => { void setStatus(null); }}>{restricted ? "확인 필요" : "미입력"}</button>}
        </div>
        {kind === "STAFF" && <label className="praise-field"><span className="sr-only">{person.name} 참석 역할</span><select value={available?.role ?? (person.singerCapable ? "SINGER" : "SESSION")} disabled={busy || !canEdit || !available} onChange={(event) => { if (available) void execute({ type: "availability.set", meetingId: meeting.id, personId: person.id, present: available.present, role: event.target.value as "SINGER" | "SESSION", expectedRevision: available.revision }); }}><option value="SINGER">싱어</option><option value="SESSION">세션</option></select></label>}
        <small className="praise-stamp">{stamp ? `${stampTime(stamp.updatedAt)} · ${authorName(view, stamp.updatedBy)}` : restricted ? "확인할 기록 없음 · 이전 담당 조 기록은 확인이 필요할 수 있습니다." : "아직 입력하지 않았습니다"}</small></div>
      </article>;
    })}</div>}
    <PraiseAuditList view={view} attendanceOnly />
  </section>;
}

/** 저장 당시 조와 현재 편집 범위를 구분한다. 내려오지 않은 원장을 결석으로 보완하지 않는다. */
function attendanceCell(view: PraiseView, meeting: PraiseMeeting, person: PraisePerson, groupId: string) {
  const student = person.kind === "STUDENT";
  const record = student ? view.attendance[meeting.id]?.[person.id] : undefined;
  const availability = student ? undefined : view.availability[meeting.id]?.[person.id];
  const historicalMeeting = record ? { ...meeting, groupVersionId: record.groupVersionId } : meeting;
  const version = latestGroups(view, historicalMeeting);
  const group = version?.groups.find((item) => item[student ? "studentIds" : "staffIds"].includes(person.id));
  const inScope = student ? canEditViewAttendance(record ? { ...view, meetings: [historicalMeeting] } : view, meeting.id, person.id) : view.permissions.stageEdit || person.id === view.permissions.staffId;
  const visible = inScope && (!groupId || group?.id === groupId);
  if (!visible) return { visible: false, canOpen: false, missing: false, label: inScope ? "선택 조 아님" : "담당 범위 밖", detail: "이 회차는 현재 조회 범위에 포함되지 않습니다.", groupName: "" };
  const status = student ? record?.status : availability?.present == null ? null : availability.present ? "PRESENT" : "ABSENT";
  const unrecorded = status == null;
  const restricted = student && !record && !view.permissions.attendanceAll;
  const cancelled = student && meeting.cancelled;
  const stamp = record ?? availability;
  const inactiveEmpty = !person.active && !stamp;
  const missing = unrecorded && !restricted && !cancelled && !inactiveEmpty;
  const label = status === "PRESENT" ? "출석" : status === "ABSENT" ? "결석" : inactiveEmpty ? "기록 없음" : cancelled ? "휴강" : restricted ? "확인할 기록 없음" : "미입력";
  const detail = [group?.name, stamp ? `${stampTime(stamp.updatedAt)} · ${authorName(view, stamp.updatedBy)}` : restricted ? "이전 담당 조 기록은 조회 범위에 따라 표시되지 않을 수 있습니다." : "저장된 출결이 없습니다.", record?.originalStatus === "LATE" ? "기존 지각 기록 이관" : "", cancelled ? "학생 모임 휴강" : ""].filter(Boolean).join(" · ");
  const canOpen = !student || canEditViewAttendance(view, meeting.id, person.id);
  return { visible, canOpen, missing, label, detail, groupName: group?.name ?? "" };
}
