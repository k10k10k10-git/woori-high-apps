"use client";

import { useMemo, useState } from "react";
import { ArrowsClockwise, Plus, Trash, UsersThree } from "@phosphor-icons/react";
import { useUI } from "@/context/UIContext";
import { balanceGroupsAcrossCompetitionTeams } from "@/lib/programPreparation";
import type { Group, RetreatProgramCompetitionTeam } from "@/lib/types";
import ProgramAutosaveField from "./ProgramAutosaveField";
import ProgramUndoNotice from "./ProgramUndoNotice";
import { useProgramUndo } from "./useProgramUndo";

type TeamColor = NonNullable<RetreatProgramCompetitionTeam["color"]>;

const TEAM_COLORS: Array<{ value: TeamColor; label: string }> = [
  { value: "blue", label: "파랑" },
  { value: "red", label: "빨강" },
  { value: "yellow", label: "노랑" },
  { value: "green", label: "초록" },
  { value: "purple", label: "보라" },
  { value: "orange", label: "주황" },
];

type Props = {
  teams: RetreatProgramCompetitionTeam[];
  groups: Group[];
  canEdit: boolean;
  onCreate: (name: string, order: number, color: TeamColor) => Promise<void>;
  onCreateDefaults: () => Promise<void>;
  onUpdate: (teamId: string, data: Partial<RetreatProgramCompetitionTeam>) => Promise<void>;
  onDelete: (teamId: string) => Promise<void>;
  onRestore: (team: RetreatProgramCompetitionTeam) => Promise<void>;
  onAssignGroup: (groupId: string, teamId: string | null) => Promise<void>;
  onApplyBalanced: (assignment: Record<string, string>) => Promise<void>;
};

export default function ProgramCompetitionTeamsSection({
  teams,
  groups,
  canEdit,
  onCreate,
  onCreateDefaults,
  onUpdate,
  onDelete,
  onRestore,
  onAssignGroup,
  onApplyBalanced,
}: Props) {
  const { toast } = useUI();
  const undo = useProgramUndo();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, string> | null>(null);
  const orderedGroups = useMemo(
    () => [...groups].sort((a, b) => a.bu.localeCompare(b.bu, "ko") || a.name.localeCompare(b.name, "ko")),
    [groups],
  );
  const currentAssignment = useMemo(() => {
    const result: Record<string, string> = {};
    for (const team of teams) {
      for (const groupId of Object.keys(team.groupIds ?? {})) result[groupId] = team.id;
    }
    return result;
  }, [teams]);
  const visibleAssignment = preview ?? currentAssignment;

  async function run(id: string, action: () => Promise<void>, failure: string) {
    setBusyId(id);
    try {
      await action();
    } catch (error) {
      toast(error instanceof Error ? error.message : failure, "error");
    } finally {
      setBusyId(null);
    }
  }

  async function addTeam() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const color = TEAM_COLORS[teams.length % TEAM_COLORS.length].value;
      await onCreate(trimmed, teams.length + 1, color);
      setName("");
    } catch (error) {
      toast(error instanceof Error ? error.message : "연합팀을 추가하지 못했습니다.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function createDefaults() {
    setBusy(true);
    try {
      await onCreateDefaults();
      toast("4개 연합팀을 만들었습니다.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "연합팀을 만들지 못했습니다.", "error");
    } finally {
      setBusy(false);
    }
  }

  function makePreview() {
    if (teams.length < 2) {
      toast("균등 배치하려면 연합팀을 2개 이상 만들어 주세요.", "warning");
      return;
    }
    if (groups.length === 0) {
      toast("먼저 수련회 조 편성을 완료해 주세요.", "warning");
      return;
    }
    setPreview(balanceGroupsAcrossCompetitionTeams(groups, teams));
  }

  async function applyPreview() {
    if (!preview) return;
    setBusy(true);
    try {
      await onApplyBalanced(preview);
      setPreview(null);
      toast("기본 조를 연합팀에 균등 배치했습니다.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "연합팀 배치를 저장하지 못했습니다.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="program-form-section program-alliance-section" aria-labelledby="program-alliance-heading">
      <div className="program-subsection-heading">
        <div>
          <h3 id="program-alliance-heading">연합팀 구성</h3>
          <p>여러 수련회 조를 큰 팀으로 묶는 활동에서만 사용합니다. 기본 조, 숙소와 인원체크 명단은 바뀌지 않습니다.</p>
        </div>
        <span className="program-count">{teams.length}팀</span>
      </div>

      {teams.length === 0 ? (
        <div className="program-alliance-empty">
          <UsersThree aria-hidden="true" size={24} />
          <div><strong>연합팀 경쟁이 있을 때만 만들어 주세요.</strong><p>예: 12개 조를 파랑, 빨강, 노랑, 초록 4개 팀으로 묶기</p></div>
          {canEdit && <button type="button" className="btn-secondary" disabled={busy} onClick={() => void createDefaults()}>4개 팀으로 시작</button>}
        </div>
      ) : (
        <div className="program-alliance-teams">
          {teams.map((team) => {
            const teamGroups = groups.filter((group) => visibleAssignment[group.id] === team.id);
            const people = teamGroups.reduce((sum, group) => sum + (group.studentIds?.length ?? 0), 0);
            return (
              <article key={team.id} className="program-alliance-team" data-color={team.color ?? "blue"} aria-busy={busyId === team.id}>
                <div className="program-alliance-team__top">
                  <span className="program-team-swatch" aria-hidden="true" />
                  <ProgramAutosaveField value={team.name} ariaLabel="연합팀 이름" maxLength={40} allowEmpty={false} disabled={!canEdit}
                    onSave={(next) => onUpdate(team.id, { name: next })} errorMessage="연합팀 이름을 바꾸지 못했습니다." />
                  {canEdit && <button type="button" className="program-task-delete" aria-label={`${team.name} 삭제`} disabled={busyId === team.id}
                    onClick={() => void run(team.id, async () => { await onDelete(team.id); undo.remember(team.name, () => onRestore(team)); }, "연합팀을 삭제하지 못했습니다.")}><Trash aria-hidden="true" size={16} /></button>}
                </div>
                <div className="program-alliance-team__meta"><strong>{people}명</strong><span>{teamGroups.map((group) => group.name).join(", ") || "배정된 조 없음"}</span></div>
                {canEdit && <label><span>표시 색</span><select className="input" value={team.color ?? "blue"}
                  onChange={(event) => void run(team.id, () => onUpdate(team.id, { color: event.target.value as TeamColor }), "팀 색을 바꾸지 못했습니다.")}>
                  {TEAM_COLORS.map((color) => <option key={color.value} value={color.value}>{color.label}</option>)}
                </select></label>}
              </article>
            );
          })}
        </div>
      )}

      {canEdit && (
        <div className="program-inline-form program-alliance-add">
          <label className="program-field program-field--wide"><span>연합팀 추가</span><input className="input" value={name} maxLength={40} placeholder="예: 보라팀"
            onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addTeam(); } }} /></label>
          <button type="button" className="btn-secondary" disabled={busy || !name.trim()} onClick={() => void addTeam()}><Plus aria-hidden="true" size={16} /> 추가</button>
        </div>
      )}

      {teams.length > 0 && (
        <div className="program-group-assignment">
          <div className="program-subsection-heading">
            <div><h4>기본 조 배정</h4><p>조를 쪼개지 않고 연합팀에 배정합니다. 균등 배치는 저장 전에 미리 확인할 수 있습니다.</p></div>
            {canEdit && <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={makePreview}><ArrowsClockwise aria-hidden="true" size={15} /> 균등 배치 미리보기</button>}
          </div>

          {preview && (
            <div className="program-assignment-preview" role="status">
              <span>아직 저장되지 않은 미리보기입니다.</span>
              <div><button type="button" className="btn-secondary btn-sm" onClick={() => setPreview(null)} disabled={busy}>취소</button>
                <button type="button" className="btn-primary btn-sm" onClick={() => void applyPreview()} disabled={busy}>이 배치 적용</button></div>
            </div>
          )}

          {orderedGroups.length === 0 ? <p className="program-task-empty">수련회 조 편성이 아직 없습니다.</p> : (
            <div className="program-assignment-list">
              {orderedGroups.map((group) => (
                <label key={group.id} className="program-assignment-row">
                  <span><strong>{group.name}</strong><small>{group.bu} / 학생 {group.studentIds?.length ?? 0}명</small></span>
                  <select className="input" aria-label={`${group.name} 연합팀`} value={visibleAssignment[group.id] ?? ""} disabled={!canEdit || busy || preview !== null}
                    onChange={(event) => void run(group.id, () => onAssignGroup(group.id, event.target.value || null), "조 배정을 바꾸지 못했습니다.")}>
                    <option value="">미배정</option>
                    {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                  </select>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {undo.pending && <ProgramUndoNotice label={undo.pending.label} busy={undo.busy} onUndo={() => void undo.undo()} onDismiss={undo.dismiss} />}
    </section>
  );
}
