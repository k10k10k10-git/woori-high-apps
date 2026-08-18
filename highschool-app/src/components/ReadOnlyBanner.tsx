// 조회 전용 화면임을 먼저 알린다.
//
// 입력칸과 버튼은 <fieldset disabled>로 잠기지만 생김새는 그대로다. 그래서 스탭팀장·
// 이가드팀·사역팀은 값을 고쳐 보려다 "왜 안 눌리지"를 겪고 나서야 조회 전용임을 알게
// 된다. 잠그는 것과 알리는 것은 다른 일이라 배너를 따로 둔다.
export default function ReadOnlyBanner({ what, why }: { what: string; why?: string }) {
  return (
    <p
      role="status"
      className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600"
    >
      <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-bold text-slate-500">조회 전용</span>
      <span>{what}를 볼 수는 있지만 저장은 되지 않습니다.</span>
      {why && <span className="text-slate-400">{why}</span>}
    </p>
  );
}
