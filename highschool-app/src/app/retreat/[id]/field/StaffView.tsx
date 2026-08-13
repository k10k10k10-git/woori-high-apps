"use client";
import { IguardStaff } from "@/features/iguard/lib/types";

// 스탭 명단·속성(나이·역할·본대여부·후발입소·프로그램팀·찬양팀·참석)은 모두
// 행정 사이트(teachers)가 단일 원천. 이가드는 읽기 전용 표시만 한다.
// (이전엔 이가드에서 staffMeta로 편집했으나 행정값이 우선이라 편집이 묻혀 혼란이 있었음.)

const dash = <span className="text-xs text-slate-300">-</span>;

export default function StaffView({ staff }: { retreatId: string; staff: IguardStaff[] }) {
  return (
    <div>
      <div className="mb-4 bg-sky-50 border border-sky-100 rounded-lg p-3 text-xs text-sky-700">
        ℹ️ 스탭 명단과 속성(나이·역할·본대여부·프로그램팀 등)은 <strong>행정 사이트</strong>에서 관리됩니다.
        <div className="mt-1">여기서는 <strong>읽기 전용</strong>으로 확인만 합니다. 수정은 행정 사이트의 교사·보조스탭에서 해주세요.</div>
      </div>
      {staff.length === 0 ? (
        <div className="card p-8 text-center text-slate-400"><div className="text-3xl mb-2">🧑‍🤝‍🧑</div><p>행정 사이트에 등록된 스탭이 없습니다.</p></div>
      ) : (
        <div className="card max-h-[72vh] overflow-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_#e2e8f0]">
              <tr className="text-xs font-semibold text-slate-500">
                <th className="px-3 py-2 text-left w-10">#</th>
                <th className="px-3 py-2 text-left">이름</th>
                <th className="px-3 py-2 text-left w-20">또래</th>
                <th className="px-3 py-2 text-left w-28">역할</th>
                <th className="px-3 py-2 text-left w-28">본대 여부</th>
                <th className="px-3 py-2 text-left">후발 입소</th>
                <th className="px-3 py-2 text-left">프로그램팀</th>
                <th className="px-3 py-2 text-left w-20">찬양팀</th>
                <th className="px-3 py-2 text-left w-20">참석</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staff.map((s, index) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 text-xs font-semibold text-slate-300">{index + 1}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-800">{s.name}</td>
                  <td className="px-3 py-2.5 text-slate-700">{s.age || dash}</td>
                  <td className="px-3 py-2.5 text-slate-700">{s.role || dash}</td>
                  <td className="px-3 py-2.5 text-slate-700">{s.corps || dash}</td>
                  <td className="px-3 py-2.5 text-slate-700">{s.corps === "후발대" ? (s.lateArrival || dash) : dash}</td>
                  <td className="px-3 py-2.5 text-slate-700">{s.programTeam || dash}</td>
                  <td className="px-3 py-2.5">{s.worship ? <span className="text-xs text-fuchsia-700">✓ 찬양팀</span> : dash}</td>
                  <td className="px-3 py-2.5">
                    {s.adminStatus ? (
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        s.adminStatus === "전참" ? "bg-emerald-50 text-emerald-700" :
                        s.adminStatus === "부분참" ? "bg-amber-50 text-amber-700" :
                        "bg-slate-100 text-slate-500"
                      }`}>{s.adminStatus}</span>
                    ) : dash}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
