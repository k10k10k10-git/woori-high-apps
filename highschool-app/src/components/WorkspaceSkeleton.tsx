type WorkspaceSkeletonProps = {
  label?: string;
  rows?: number;
  variant?: "page" | "panel";
};

export default function WorkspaceSkeleton({
  label = "데이터를 불러오는 중입니다.",
  rows = 5,
  variant = "panel",
}: WorkspaceSkeletonProps) {
  return (
    <div
      className={`workspace-skeleton workspace-skeleton--${variant}`}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">{label}</span>
      <div className="workspace-skeleton__eyebrow" />
      <div className="workspace-skeleton__title" />
      <div className="workspace-skeleton__toolbar">
        <div />
        <div />
        <div />
      </div>
      <div className="workspace-skeleton__rows" aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="workspace-skeleton__row">
            <span />
            <span />
            <span />
          </div>
        ))}
      </div>
    </div>
  );
}
