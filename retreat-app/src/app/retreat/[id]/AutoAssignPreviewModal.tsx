"use client";
import { Group, TeacherAttendance } from "@/lib/types";
import { groupDisplayName } from "@/lib/groupNumber";
import { ClassUnit } from "./autoAssignUtils";

// ── 타입 ─────────────────────────────────────────────────────────────

export interface AutoAssignPreviewModalProps {
  groups: Group[];
  units1: ClassUnit[];
  units2: ClassUnit[];
  teachers: TeacherAttendance[];
  onApply: (groups: Group[]) => void;
  onRerun: () => void;
  onClose: () => void;
}

// ── 컴포넌트 ─────────────────────────────────────────────────────────

export default function AutoAssignPreviewModal({
  groups, units1, units2, teachers, onApply, onRerun, onClose,
}: AutoAssignPreviewModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}>
      <div className="card p-6 w-full max-w-4xl max-h-[88vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-lg">🎲 자동 배정 결과 미리보기</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <p className="text-xs text-orange-500 mb-4">⚠ 적용 시 기존 조편성이 모두 교체됩니다. 저장 후 수동 수정 가능합니다.</p>

        <div className="overflow-y-auto flex-1 space-y-6">
          {["1부", "2부"].map(bu => {
            const buGroups = groups.filter(g => g.bu === bu);
            const buUnits = bu === "1부" ? units1 : units2;
            if (buGroups.length === 0) return null;

            // 각 조의 반 구성 계산
            const groupUnitMap = new Map<string, ClassUnit[]>();
            buGroups.forEach(g => {
              const leaderNames = new Set((g.leader || "").split(",").map(name => name.trim()).filter(Boolean));
              // 파송 조장 studentId는 목표 조에 포함되지만 본인 반을 대표하지 않는다.
              // 조장 이름을 제외한 실제 반 학생만으로 미리보기의 반 구성을 계산한다.
              const inThisGroup = buUnits.map(u => {
                const members = u.studentIds
                  .map((studentId, i) => ({ studentId, name: u.names[i] }))
                  .filter(member => g.studentIds.includes(member.studentId) && !leaderNames.has(member.name));
                return { ...u, studentIds: members.map(member => member.studentId), names: members.map(member => member.name) };
              }).filter(u => u.studentIds.length > 0);
              groupUnitMap.set(g.id, inThisGroup);
            });

            return (
              <div key={bu}>
                <h4 className={`text-sm font-bold mb-3 pb-1 border-b ${bu === "1부" ? "text-green-700 border-green-200" : "text-purple-700 border-purple-200"}`}>
                  {bu} — {buGroups.length}조
                </h4>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {buGroups.map(g => {
                    const units = groupUnitMap.get(g.id) || [];
                    const maleUnits = units.filter(u => u.gender === "남");
                    const femaleUnits = units.filter(u => u.gender === "여");
                    const gradeSet = [...new Set(units.map(u => u.grade))].sort();
                    return (
                      <div key={g.id} className="border border-slate-200 rounded-lg p-3 text-xs">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-bold text-slate-800 text-sm">{groupDisplayName(g, groups)}</span>
                          <span className="text-slate-400">{g.studentIds.length}명</span>
                          <span className="ml-auto text-slate-300">{gradeSet.map(gr => `${gr}학년`).join("·")}</span>
                        </div>
                        {g.teachers.length > 0 && (
                          <div className="mb-2 space-y-0.5">
                            {g.teachers.map(tn => {
                              const ta = [...units1, ...units2].length >= 0
                                ? teachers.find(t => t.name === tn) : undefined;
                              const isFull = ta?.status === "전참";
                              const isPart = ta?.status === "부분참";
                              return (
                                <span key={tn} className={`inline-flex items-center gap-1 mr-1 px-1.5 py-0.5 rounded text-xs ${isFull ? "bg-green-50 text-green-700" : isPart ? "bg-orange-50 text-orange-600" : "bg-slate-50 text-slate-500"}`}>
                                  👨‍🏫 {tn}
                                  {isFull && <span className="text-green-500 font-bold text-[10px]">전참</span>}
                                  {isPart && <span className="text-orange-400 text-[10px]">부분참</span>}
                                </span>
                              );
                            })}
                          </div>
                        )}
                        {g.leader && (
                          <div className="mb-2 inline-flex items-center rounded bg-yellow-50 border border-yellow-200 px-1.5 py-0.5 text-yellow-800">
                            ⭐ 조장 {g.leader}
                          </div>
                        )}
                        {!g.teachers.some(tn => teachers.find(t => t.name === tn)?.status === "전참") && (
                          <div className="text-xs text-red-400 mb-1">⚠ 전참 교사 없음</div>
                        )}
                        {/* 남자반 */}
                        {maleUnits.length > 0 && (
                          <div className="mb-1">
                            <span className="text-blue-500 font-semibold">남 </span>
                            {maleUnits.sort((a, b) => a.grade - b.grade || a.classNum - b.classNum).map(u => (
                              <span key={u.key} className="inline-block bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 mr-1 mb-1">
                                {u.grade}학년{u.classNum}반({u.studentIds.length}명)
                              </span>
                            ))}
                          </div>
                        )}
                        {/* 여자반 */}
                        {femaleUnits.length > 0 && (
                          <div>
                            <span className="text-pink-500 font-semibold">여 </span>
                            {femaleUnits.sort((a, b) => a.grade - b.grade || a.classNum - b.classNum).map(u => (
                              <span key={u.key} className="inline-block bg-pink-50 text-pink-700 border border-pink-200 rounded px-1.5 py-0.5 mr-1 mb-1">
                                {u.grade}학년{u.classNum}반({u.studentIds.length}명)
                              </span>
                            ))}
                          </div>
                        )}
                        {units.length === 0 && (
                          <p className="text-slate-300 italic">배정 없음</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 pt-4 border-t border-slate-100 mt-4">
          <button onClick={() => { onApply(groups); onClose(); }}
            className="btn-primary flex-1 justify-center">✅ 이 배정으로 적용</button>
          <button onClick={() => { onClose(); setTimeout(onRerun, 100); }}
            className="btn-secondary flex-1 justify-center">🔄 다시 뽑기</button>
          <button onClick={onClose}
            className="btn-secondary px-5 justify-center">취소</button>
        </div>
      </div>
    </div>
  );
}
