import Link from "next/link";

/** 기술 오류나 DB 경로 대신 실패한 업무와 실제 복구 행동을 안내한다. */
export default function LoadFailureNotice({ title, sources = [], onRetry, retryLabel = "다시 불러오기", description = "연결 상태를 확인한 뒤 다시 시도해 주세요. 계속 안 되면 교역자 또는 통합관리자에게 문의해 주세요." }: {
  title: string;
  sources?: string[];
  onRetry: () => void;
  retryLabel?: string;
  description?: string;
}) {
  return <div className="team-first-alert workspace-load-failure" role="alert">
    <div><strong>{title}</strong>{sources.length > 0 && <p>확인하지 못한 항목: {sources.join(" · ")}</p>}<p>{description}</p></div>
    <button type="button" className="btn-secondary" onClick={onRetry}>{retryLabel}</button>
    <Link className="btn-secondary" href="/library/help#connection">접속 문제 도움말</Link>
  </div>;
}
