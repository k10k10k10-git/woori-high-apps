import { GuideContent, PraiseResourceLibrary } from "../content/GuideContent";
import { canEditViewAttendance, canReadPraiseStudentAttendance } from "../permissions";
import type { PraiseMeeting, PraiseView } from "../types";
import { Empty, latestGroups, personName, sourceTime } from "./shared";

import { PraiseAuditList } from "./PraiseAuditList";

export function PraiseWeek({ view, meeting, onTab }: { view: PraiseView; meeting: PraiseMeeting | null; onTab: (tab: string) => void }) {
  const confirmed = view.stages.filter((stage) => stage.meetingId === meeting?.id && stage.kind === "CONFIRMED").sort((a, b) => b.number - a.number)[0];
  const groupVersion = latestGroups(view, meeting);
  const guide = view.guides.find((item) => item.meetingId === meeting?.id && item.published);
  const students = view.people.filter((person) => person.active && person.kind === "STUDENT" && meeting && canEditViewAttendance(view, meeting.id, person.id));
  const canRecordStudents = canReadPraiseStudentAttendance(view.permissions);
  const ownAvailability = meeting && view.permissions.staffId ? view.availability[meeting.id]?.[view.permissions.staffId]?.present : null;
  const records = meeting ? view.attendance[meeting.id] ?? {} : {};
  const present = students.filter((person) => records[person.id]?.status === "PRESENT").length;
  const missing = students.filter((person) => records[person.id]?.status == null && (view.permissions.attendanceAll || Boolean(records[person.id]))).length;
  const unknown = view.permissions.attendanceAll ? 0 : students.filter((person) => !records[person.id]).length;
  return <div className="praise-stack">
    <section className="praise-section"><div className="praise-section-heading"><div><h2>{meeting ? `${meeting.date} 모임` : "첫 모임을 준비해 주세요"}</h2><p>{meeting ? `${meeting.title} · ${meeting.worshipDate} 주일 예배` : "운영 설정에서 일정과 팀원을 등록하면 이번 주 업무가 모입니다."}</p></div>{meeting?.cancelled && <span className="praise-badge">휴강</span>}</div>
      {view.meta.mode !== "live" && <p className="praise-note">{view.meta.mode === "setup" ? "초기 설정 중입니다. 기존 운영 기록은 자동으로 가져오지 않습니다. 이관을 마친 뒤 운영을 시작해 주세요." : "운영 검증 중입니다. 이 화면의 기록을 기존 운영본과 확인해 주세요."}</p>}
      {view.meta.sourceAsOf && <p className="praise-note">외부 운영 원본 기준 · {sourceTime(view.meta.sourceAsOf)}</p>}
      {view.permissions.manage && Boolean(view.meta.importBlockers?.length) && <div className="praise-warning"><strong>운영 전환 전에 확인할 항목</strong><ul>{view.meta.importBlockers?.slice(0, 10).map((issue, index) => <li key={index}>{issue}</li>)}</ul></div>}
      <div className="praise-work-list">
        <div><strong>조편성</strong><span>{groupVersion ? `${groupVersion.groups.length}개 조 · 확정 ${groupVersion.number}차` : "미확정"}</span>{view.permissions.manage && <button className="praise-text-button" onClick={() => onTab("people")}>편성 확인</button>}</div>
        {(canRecordStudents || view.permissions.staffId) && <div><strong>{canRecordStudents ? view.permissions.attendanceAll ? "출결" : "내 담당 조 출결" : "내 참석"}</strong><span>{canRecordStudents ? `출석 ${present}명 · 미입력 ${missing}명${unknown ? ` · 확인 필요 ${unknown}명` : ""}` : ownAvailability == null ? "미입력" : ownAvailability ? "참석" : "불참"}</span><button className="praise-text-button" onClick={() => onTab("attendance")}>출결 기록</button></div>}
        <div><strong>주일 등단</strong><span>{confirmed ? `${confirmed.number}차 확정 · 인도 ${confirmed.leaderName}` : "확정본을 기다리고 있습니다"}</span><button className="praise-text-button" onClick={() => onTab("stage")}>등단표 보기</button></div>
        <div><strong>진행 가이드</strong><span>{guide ? "이번 회차 가이드 게시됨" : "게시된 가이드 없음"}</span>{view.permissions.manage && <button className="praise-text-button" onClick={() => onTab("settings")}>가이드 준비</button>}</div>
      </div>
    </section>
    {groupVersion && <section className="praise-section"><h2>함께하는 조</h2><div className="praise-group-overview">{groupVersion.groups.map((group) => <div key={group.id}><h3>{group.name}</h3><p className="praise-note">담당 {group.staffIds.map((id) => personName(view, id)).join(" · ") || "미배정"}</p><p>{group.studentIds.map((id) => personName(view, id)).join(" · ") || "학생 미배정"}</p></div>)}</div></section>}
    <section className="praise-section">{guide ? <GuideContent guide={guide.content} /> : <><h2>이번 회차 진행 가이드</h2><Empty>아직 게시된 안내가 없습니다. 운영 책임자가 회차 가이드를 게시하면 이곳에서 볼 수 있습니다.</Empty><PraiseResourceLibrary /></>}</section>
    <PraiseAuditList view={view} />
  </div>;
}
