import Link from "next/link";
import { praiseAccountProgress } from "../domain/workflow";
import { praiseSemesterHref } from "../navigation";
import type { PraiseView } from "../types";
import { sourceTime } from "./shared";

export const importReviewLabels: Record<string, string> = {
  historical_group_unresolved: "과거 출석 당시의 조편성 확인이 필요합니다.",
  source_snapshot_unverified: "기존 사이트의 입력 중단과 최종 기록 대조가 필요합니다.",
  source_storage_incomplete: "기존 업로드 파일 원본이 아직 전달되지 않았습니다.",
  shared_attendance_cutover_pending: "학기 사역과 같은 모임의 출석 연결을 확인해야 합니다.",
};
export function PraiseConnectionDetails({ view }: { view: PraiseView }) {
  const accounts = praiseAccountProgress(view);
  const href = praiseSemesterHref(view.meta);
  const issues = [...new Set([...(view.meta.importBlockers ?? []), ...(view.meta.historyReview ?? [])])];
  return <section className="praise-section praise-connection" aria-label="명단과 운영 연결">
    <h3>명단과 운영 연결</h3>
    <p className="praise-note">학기 배치는 소속을, 이 화면은 찬양팀 조·출결·등단을 관리합니다. 연결된 모임의 학생 출결은 학기 화면과 같은 기록입니다.</p>
    <dl className="praise-connection-list">
      <div><dt>학기 명단</dt><dd>{view.people.filter((person) => person.rosterLink?.applicationKey).length} / {view.people.length}명 연결</dd></div>
      <div><dt>모임 회차</dt><dd>{view.meetings.filter((meeting) => meeting.linkedSessionId).length} / {view.meetings.length}회 연결</dd></div>
      <div><dt>스탭 로그인</dt><dd>{accounts.linked} / {accounts.total}명 연결</dd></div>
    </dl>
    {href && <Link className="praise-context-link" href={href}>학기 찬양팀 명단 확인</Link>}
    {accounts.missing.length > 0 && <p className="praise-warning">명단에 등록된 스탭 중 {accounts.missing.length}명의 로그인 연결이 남았습니다. 아래 ‘담당 계정 연결’에서 실제 로그인 계정과 담당 역할을 확인해 연결해 주세요.</p>}
    {(view.meta.sourceAsOf || view.meta.readOnlyBefore || issues.length > 0) && <details className="praise-disclosure"><summary>이전 사이트 기록과 보관 범위</summary>
      {view.meta.sourceAsOf && <p className="praise-note">가져온 원본 기준 · {sourceTime(view.meta.sourceAsOf)}</p>}
      {view.meta.readOnlyBefore && <p className="praise-note">{view.meta.readOnlyBefore}부터 통합 사이트에서 입력합니다. 이전 출결·등단은 보관 기록입니다. 기존 사이트의 관리자 입력 차단 여부는 별도로 확인해야 합니다.</p>}
      {issues.length > 0 && <ul>{issues.map((issue) => <li key={issue}>{importReviewLabels[issue] ?? "운영 담당자가 확인할 추가 항목이 있습니다."}</li>)}</ul>}
    </details>}
  </section>;
}
