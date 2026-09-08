import { ArrowRight, CheckCircle, Clock } from "@phosphor-icons/react";
import { GuideContent, PraiseResourceLibrary } from "../content/GuideContent";
import { canReadPraiseStudentAttendance } from "../permissions";
import { praiseAccountProgress, praiseAttendanceProgress } from "../domain/workflow";
import type { PraiseMeeting, PraiseView } from "../types";
import { hasUnresolvedImportedGroup, latestGroups, personName, praiseMeetingWriteLocked } from "./shared";
import { PraiseAuditList } from "./PraiseAuditList";
import { importReviewLabels } from "./PraiseConnectionDetails";

export function PraiseWeek({ view, meeting, onTab }: { view: PraiseView; meeting: PraiseMeeting | null; onTab: (tab: string) => void }) {
  const stages = view.stages.filter((stage) => stage.meetingId === meeting?.id).sort((a, b) => b.number - a.number);
  const confirmed = stages.find((stage) => stage.kind === "CONFIRMED");
  const newerDraft = confirmed ? stages.some((stage) => stage.number > confirmed.number) : stages.length > 0;
  const stale = Boolean(confirmed && !confirmed.imported && meeting && view.inputRevisions[meeting.id] && confirmed.inputRevision !== view.inputRevisions[meeting.id]);
  const groupVersion = latestGroups(view, meeting);
  const guide = view.guides.find((item) => item.meetingId === meeting?.id && item.published);
  const progress = praiseAttendanceProgress(view, meeting);
  const accounts = praiseAccountProgress(view);
  const canRecordStudents = canReadPraiseStudentAttendance(view.permissions);
  const ownAvailability = meeting && view.permissions.staffId ? view.availability[meeting.id]?.[view.permissions.staffId]?.present : null;
  const locked = !meeting || meeting.cancelled || praiseMeetingWriteLocked(view, meeting);
  const attendanceLabel = `출석 ${progress.present}명 · 미입력 ${progress.missing}명${progress.unknown ? ` · 확인 필요 ${progress.unknown}명` : ""}${progress.invalid ? ` · 연결 확인 필요 ${progress.invalid}명` : ""}`;
  const groups = view.permissions.manage || view.permissions.stageEdit ? groupVersion?.groups : groupVersion?.groups.filter((group) => view.permissions.staffId && group.staffIds.includes(view.permissions.staffId));
  const next = !meeting
    ? view.permissions.manage ? { title: "첫 모임 일정을 준비해 주세요", label: "일정 준비하기", tab: "settings" } : null
    : locked ? { title: meeting.cancelled ? "이번 회차는 휴강입니다" : "보관된 모임을 보고 있습니다", label: "등단 기록 보기", tab: "stage" }
    : !groupVersion && view.permissions.manage ? { title: "출결을 시작할 조편성을 확인해 주세요", label: "조편성 열기", tab: "groups" }
    : canRecordStudents && (progress.missing + progress.unknown + progress.invalid > 0) ? { title: progress.invalid ? "출결을 입력하기 전에 명단 연결을 확인해 주세요" : "이번 모임 출결을 마무리해 주세요", label: "출결 이어서 입력", tab: "attendance" }
    : view.permissions.staffId && ownAvailability == null ? { title: "이번 주일 참석 여부를 알려 주세요", label: "내 참석 입력", tab: "attendance" }
    : view.permissions.stageEdit && (!confirmed || stale || newerDraft) ? { title: stale ? "출결이 바뀌어 등단표 확인이 필요합니다" : "이번 주일 등단표를 준비해 주세요", label: "등단 편성 이어가기", tab: "stage" }
    : { title: confirmed ? "확정된 등단표를 확인해 주세요" : "등단표가 확정되면 이곳에서 확인할 수 있습니다", label: "등단표 확인", tab: "stage" };
  return <div className="praise-stack">
    <section className="praise-section praise-week-focus" aria-label="이번 모임 할 일">
      <div className="praise-section-heading"><div><h2>{meeting ? `${meeting.date} 모임` : "첫 모임을 준비해 주세요"}</h2><p>{meeting ? `${meeting.title} · ${meeting.worshipDate} 주일 예배` : "운영 설정에서 일정과 팀원을 등록하면 이번 주 업무가 모입니다."}</p></div>{meeting?.cancelled && <span className="praise-badge">휴강</span>}</div>
      {next && <div className="praise-next-action"><div><strong>{next.title}</strong><p>{canRecordStudents && progress.total > 0 ? `${progress.total}명 중 ${progress.present + progress.absent}명 입력 · 결석 ${progress.absent}명` : "담당한 업무와 현재 회차의 기록을 확인합니다."}</p></div><button className="praise-button praise-button--primary" onClick={() => onTab(next.tab)}>{next.label}<ArrowRight size={16} aria-hidden="true" /></button></div>}
      {view.permissions.role === "observer" && <p className="praise-note">현재 계정은 조회 전용입니다. 조 출결이나 본인 참석 입력이 필요하면 운영 책임자에게 스탭 계정 연결을 요청해 주세요.</p>}
      {view.meta.mode !== "live" && <p className="praise-note">{view.meta.mode === "setup" ? "초기 설정 중입니다. 운영 책임자가 준비를 마치면 팀 업무를 시작할 수 있습니다." : "기존 기록을 대조하고 있습니다. 확인이 끝날 때까지 출결·등단은 읽기 전용입니다."}</p>}
      {view.permissions.manage && Boolean(view.meta.importBlockers?.length) && <div className="praise-warning"><strong>운영 전환 전에 확인할 항목</strong><ul>{view.meta.importBlockers?.map((issue, index) => <li key={index}>{importReviewLabels[issue] ?? "추가 확인이 필요한 항목이 있습니다. 운영 담당자에게 확인해 주세요."}</li>)}</ul></div>}
      <ol className="praise-task-flow" aria-label="모임에서 주일까지">
        <li><CheckState done={Boolean(groupVersion)} /><div><strong>조편성</strong><p>{groupVersion ? `${groupVersion.groups.length}개 조 · 확정 ${groupVersion.number}차` : hasUnresolvedImportedGroup(view, meeting) ? "과거 조 확인 필요" : "미확정"}</p></div>{view.permissions.stageEdit && <button className="praise-text-button" onClick={() => onTab("groups")}>편성 확인</button>}</li>
        {(canRecordStudents || view.permissions.staffId) && <li><CheckState done={canRecordStudents ? progress.complete : ownAvailability != null} /><div><strong>{canRecordStudents ? view.permissions.attendanceAll ? "모임 출결" : "내 담당 조 출결" : "내 주일 참석"}</strong><p>{canRecordStudents ? attendanceLabel : ownAvailability == null ? "미입력" : ownAvailability ? "참석" : "불참"}</p></div><button className="praise-text-button" onClick={() => onTab("attendance")}>{locked ? "기록 확인" : "출결 기록"}</button></li>}
        <li><CheckState done={Boolean(confirmed && !stale && !newerDraft)} /><div><strong>주일 등단·공유</strong><p>{confirmed ? `${confirmed.number}차 확정 · 인도 ${confirmed.leaderName}${stale ? " · 출결 변경 확인 필요" : newerDraft ? " · 새 초안 작업 중" : ""}` : newerDraft ? "초안 작성 중 · 아직 확정되지 않았습니다" : "확정본을 기다리고 있습니다"}</p></div><button className="praise-text-button" onClick={() => onTab("stage")}>등단표 보기</button></li>
      </ol>
      {view.permissions.manage && accounts.missing.length > 0 && <div className="praise-setup-notice"><p><strong>스탭 로그인 연결 {accounts.missing.length}명 남음</strong><span>명단 등록과 로그인 연결은 별개입니다. 담당 조 입력 권한을 준비해 주세요.</span></p><button className="praise-text-button" onClick={() => onTab("settings")}>계정 연결 확인</button></div>}
    </section>
    {Boolean(groups?.length) && <section className="praise-section"><div className="praise-section-heading"><h2>{view.permissions.manage || view.permissions.stageEdit ? "함께하는 조" : "내가 맡은 조"}</h2>{canRecordStudents && <button className="praise-text-button" onClick={() => onTab("attendance")}>출결 열기</button>}</div><div className="praise-group-overview">{groups?.map((group) => <div key={group.id}><h3>{group.name}</h3><p className="praise-note">담당 {group.staffIds.map((id) => personName(view, id)).join(" · ") || "미배정"}</p><p>{group.studentIds.map((id) => personName(view, id)).join(" · ") || "학생 미배정"}</p></div>)}</div></section>}
    <section className="praise-section"><details className="praise-disclosure" open={guide ? true : undefined}><summary>이번 모임 진행 안내{guide ? " · 게시됨" : " · 아직 게시되지 않음"}</summary>{guide ? <GuideContent guide={guide.content} /> : <><p className="praise-note">운영 책임자가 회차 안내를 게시하면 팀원 모두가 이곳에서 확인할 수 있습니다.</p>{view.permissions.manage && <button className="praise-text-button" onClick={() => onTab("settings")}>진행 안내 준비</button>}</>}</details><details className="praise-disclosure"><summary>나눔 자료·인쇄물</summary><PraiseResourceLibrary /></details></section>
    <PraiseAuditList view={view} />
  </div>;
}
function CheckState({ done }: { done: boolean }) { return done ? <CheckCircle className="praise-task-done" size={21} aria-label="완료" /> : <Clock className="praise-task-pending" size={21} aria-label="확인 필요" />; }
