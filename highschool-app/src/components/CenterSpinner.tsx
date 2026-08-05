export default function CenterSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--color-screen-bg)" }}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }} />
        <div className="text-slate-400 text-sm">로딩 중...</div>
      </div>
    </div>
  );
}
