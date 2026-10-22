"use client";

import { useState } from "react";
import { CaretDown, Plus, Trash } from "@phosphor-icons/react";
import { useUI } from "@/context/UIContext";
import ProgramAutosaveField from "./ProgramAutosaveField";
import ProgramRunOfShow from "./ProgramRunOfShow";
import ProgramUndoNotice from "./ProgramUndoNotice";
import { useProgramUndo } from "./useProgramUndo";
import {
  PROGRAM_ACTIVITY_TYPE_META,
  PROGRAM_ITEM_STATUS_META,
  PROGRAM_OPERATION_MODE_META,
  PROGRAM_PARTICIPATION_MODE_META,
  moveProgramPostOrder,
  nextMatchRound,
  postMatchRounds,
  programBudget,
  programActivityType,
  programActivityRequirements,
  programItemTotal,
  programOperationMode,
  programParticipationMode,
  parseProgramActivityPaste,
} from "@/lib/programPreparation";
import type { ProgramGroupedEntries } from "@/lib/programPreparation";
import type {
  RetreatProgramActivityType,
  RetreatProgramItem,
  RetreatProgramItemStatus,
  RetreatProgramMatch,
  RetreatProgramOperationMode,
  RetreatProgramParticipationMode,
  RetreatProgramPost,
  RetreatProgramRole,
} from "@/lib/types";

/**
 * 프로그램 하위 항목(게임·역할·물품) 편집 화면.
 *
 * 본문(프로그램 필드)과 달리 이 항목들은 **입력 즉시 저장**한다. 준비 시트에서 여러 명이
 * 같은 표를 동시에 채우던 작업이라, 저장 버튼 하나에 묶으면 서로의 줄을 덮어쓴다.
 * 저장 단위가 줄 하나이므로 경로 단위 update만 쓰고 프로그램 노드는 건드리지 않는다.
 */

const won = (value: number) => `₩${value.toLocaleString("ko-KR")}`;

/** 입력칸에서 숫자만 걸러 낸다. 비어 있으면 undefined. */
function digits(value: string): number | undefined {
  const only = value.replace(/[^0-9]/g, "");
  return only ? Number(only) : undefined;
}

function useRowBusy() {
  const [busyId, setBusyId] = useState<string | null>(null);
  const { toast } = useUI();
  async function run(id: string, action: () => Promise<unknown>, failMessage: string) {
    setBusyId(id);
    try {
      await action();
    } catch (error) {
      toast(error instanceof Error ? error.message : failMessage, "error");
    } finally {
      setBusyId(null);
    }
  }
  return { busyId, run };
}



// ── 게임 카드 안의 물품·역할 ──────────────────────────────────
// 시트에서 게임 탭 하나에 준비물·스탭이 같이 있던 구조를 되살린다.
// 여기서 넣으면 postId가 자동으로 붙어, 물품·예산·역할·배치 탭에서 게임별로 묶여 보인다.
function PostSubEntries({
  post, items, roles, canEdit,
  onCreateItem, onUpdateItem, onDeleteItem, onRestoreItem,
  onCreateRole, onUpdateRole, onDeleteRole, onRestoreRole,
}: {
  post: RetreatProgramPost;
  items: RetreatProgramItem[];
  roles: RetreatProgramRole[];
  canEdit: boolean;
  onCreateItem: (name: string, order: number, postId: string) => Promise<void>;
  onUpdateItem: (itemId: string, data: Partial<RetreatProgramItem>) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onCreateRole: (role: string, order: number, postId: string) => Promise<void>;
  onUpdateRole: (roleId: string, data: Partial<RetreatProgramRole>) => Promise<void>;
  onDeleteRole: (roleId: string) => Promise<void>;
  onRestoreItem: (item: RetreatProgramItem) => Promise<void>;
  onRestoreRole: (role: RetreatProgramRole) => Promise<void>;
}) {
  const { busyId, run } = useRowBusy();
  const undo = useProgramUndo();
  const [itemName, setItemName] = useState("");
  const [roleName, setRoleName] = useState("");
  const budget = programBudget(items);
  const addItem = () => {
    if (!itemName.trim() || busyId) return;
    void run("create-item", async () => {
      await onCreateItem(itemName.trim(), items.length + 1, post.id);
      setItemName("");
    }, "준비물을 추가하지 못했습니다.");
  };
  const addRole = () => {
    if (!roleName.trim() || busyId) return;
    void run("create-role", async () => {
      await onCreateRole(roleName.trim(), roles.length + 1, post.id);
      setRoleName("");
    }, "역할을 추가하지 못했습니다.");
  };

  return (
    <div className="program-post-subs">
      <section aria-label={`${post.name} 준비물`}>
        <div className="program-subsection-heading">
          <h5>준비물</h5>
          <span className="program-count">{items.length}건 / {won(budget.total)}</span>
        </div>
        {canEdit && (
          <div className="program-inline-form">
            <input id={`program-item-add-${post.id}`} className="input" aria-label="활동 준비물 이름" disabled={busyId !== null} value={itemName} maxLength={80} placeholder="예: 줄자"
              onChange={(event) => setItemName(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addItem(); } }} />
            <button type="button" className="btn-secondary btn-sm" disabled={busyId !== null || !itemName.trim()}
              onClick={addItem}>
              <Plus aria-hidden="true" size={15} /> 추가
            </button>
          </div>
        )}
        {items.length === 0 ? <p className="program-task-empty">아직 준비물이 없습니다.</p> : (
          <div className="program-table-scroll">
            <table className="program-table">
              <thead><tr><th>상태</th><th>이름</th><th>수량</th><th>단가</th><th>금액</th>{canEdit && <th aria-label="삭제" />}</tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} aria-busy={busyId === item.id}>
                    <td><select className="input" value={item.status} disabled={!canEdit}
                      onChange={(event) => void run(item.id, () => onUpdateItem(item.id, { status: event.target.value as RetreatProgramItemStatus }), "상태를 바꾸지 못했습니다.")}>
                      {Object.entries(PROGRAM_ITEM_STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
                    </select></td>
                    <td><ProgramAutosaveField
                        value={item.name}
                        ariaLabel="이름"
                        maxLength={80}
                        allowEmpty={false}
                        disabled={!canEdit}
                        onSave={(next) => onUpdateItem(item.id, { name: next })}
                        errorMessage="이름을 수정하지 못했습니다."
                      /></td>
                    <td><ProgramAutosaveField
                        id={`program-item-quantity-${item.id}`}
                        value={item.quantity ?? ""}
                        ariaLabel="수량"
                        className="program-number"
                        inputMode="numeric"
                        disabled={!canEdit}
                        onSave={(next) => onUpdateItem(item.id, { quantity: digits(next) ?? null as never })}
                        errorMessage="수량을 수정하지 못했습니다."
                      /></td>
                    <td><ProgramAutosaveField
                        value={item.unitPrice ?? ""}
                        ariaLabel="단가"
                        className="program-number"
                        inputMode="numeric"
                        disabled={!canEdit}
                        onSave={(next) => onUpdateItem(item.id, { unitPrice: digits(next) ?? null as never })}
                        errorMessage="단가를 수정하지 못했습니다."
                      /></td>
                    <td className="program-money">{won(programItemTotal(item))}</td>
                    {canEdit && <td><button type="button" className="program-task-delete" disabled={busyId === item.id} aria-label={`${item.name} 삭제`}
                      onClick={() => void run(item.id, async () => { await onDeleteItem(item.id); undo.remember(item.name, () => onRestoreItem(item)); }, "물품을 삭제하지 못했습니다.")}><Trash aria-hidden="true" size={16} /></button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-label={`${post.name} 역할`}>
        <div className="program-subsection-heading">
          <h5>역할</h5>
          <span className="program-count">{roles.length}명</span>
        </div>
        {canEdit && (
          <div className="program-inline-form">
            <input id={`program-role-add-${post.id}`} className="input" aria-label="활동 역할 이름" disabled={busyId !== null} value={roleName} maxLength={80} placeholder="예: 진행 / 점수 기록"
              onChange={(event) => setRoleName(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addRole(); } }} />
            <button type="button" className="btn-secondary btn-sm" disabled={busyId !== null || !roleName.trim()}
              onClick={addRole}>
              <Plus aria-hidden="true" size={15} /> 추가
            </button>
          </div>
        )}
        {roles.length === 0 ? <p className="program-task-empty">아직 역할이 없습니다.</p> : (
          <div className="program-table-scroll">
            <table className="program-table">
              <thead><tr><th>역할</th><th>담당</th><th>세부 내용</th>{canEdit && <th aria-label="삭제" />}</tr></thead>
              <tbody>
                {roles.map((entry) => (
                  <tr key={entry.id} aria-busy={busyId === entry.id}>
                    <td><ProgramAutosaveField
                        value={entry.role}
                        ariaLabel="역할"
                        maxLength={80}
                        allowEmpty={false}
                        disabled={!canEdit}
                        onSave={(next) => onUpdateRole(entry.id, { role: next })}
                        errorMessage="역할을 수정하지 못했습니다."
                      /></td>
                    <td><ProgramAutosaveField
                        id={`program-role-assignee-${entry.id}`}
                        value={entry.assignee ?? ""}
                        ariaLabel="담당"
                        maxLength={120}
                        disabled={!canEdit}
                        onSave={(next) => onUpdateRole(entry.id, { assignee: next })}
                        errorMessage="담당을 수정하지 못했습니다."
                      /></td>
                    <td><ProgramAutosaveField
                        value={entry.detail ?? ""}
                        ariaLabel="내용"
                        maxLength={400}
                        disabled={!canEdit}
                        onSave={(next) => onUpdateRole(entry.id, { detail: next })}
                        errorMessage="내용을 수정하지 못했습니다."
                      /></td>
                    {canEdit && <td><button type="button" className="program-task-delete" disabled={busyId === entry.id} aria-label={`${entry.role} 삭제`}
                      onClick={() => void run(entry.id, async () => { await onDeleteRole(entry.id); undo.remember(entry.role, () => onRestoreRole(entry)); }, "역할을 삭제하지 못했습니다.")}><Trash aria-hidden="true" size={16} /></button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {undo.pending && (
        <ProgramUndoNotice label={undo.pending.label} busy={undo.busy} onUndo={() => void undo.undo()} onDismiss={undo.dismiss} />
      )}
    </div>
  );
}

// ── 대진표 (게임 카드 안) ───────────────────────────────────────
function ProgramBracket({
  post, canEdit, onCreateMatch, onUpdateMatch, onDeleteMatch, onRestoreMatch,
}: {
  post: RetreatProgramPost;
  canEdit: boolean;
  onCreateMatch: (postId: string, data: { round: number; order: number }) => Promise<void>;
  onUpdateMatch: (postId: string, matchId: string, data: Partial<RetreatProgramMatch>) => Promise<void>;
  onDeleteMatch: (postId: string, matchId: string) => Promise<void>;
  onRestoreMatch: (postId: string, match: RetreatProgramMatch) => Promise<void>;
}) {
  const { busyId, run } = useRowBusy();
  const undo = useProgramUndo();
  const [adding, setAdding] = useState(false);
  const rounds = postMatchRounds(post);
  const totalMatches = rounds.reduce((sum, entry) => sum + entry.matches.length, 0);

  async function addMatch(round: number) {
    setAdding(true);
    try {
      const bucket = rounds.find((entry) => entry.round === round);
      await onCreateMatch(post.id, { round, order: (bucket?.matches.length ?? 0) + 1 });
    } finally {
      setAdding(false);
    }
  }

  return (
    <section className="program-bracket" aria-label={`${post.name} 대진표`}>
      <div className="program-subsection-heading">
        <div>
          <h4>대진표</h4>
        </div>
        <span className="program-count">{totalMatches}경기</span>
      </div>

      {rounds.length === 0 ? (
        <p className="program-task-empty">아직 대진이 없습니다.</p>
      ) : (
        rounds.map((entry) => (
          <div key={entry.round} className="program-bracket-round">
            <h5>{entry.round}라운드</h5>
            <div className="program-table-scroll">
              <table className="program-table">
                <thead>
                  <tr><th>시간</th><th>장소</th><th>A</th><th>B</th><th>결과</th>{canEdit && <th aria-label="삭제" />}</tr>
                </thead>
                <tbody>
                  {entry.matches.map((match) => (
                    <tr key={match.id} aria-busy={busyId === match.id}>
                      <td><ProgramAutosaveField
                        value={match.time ?? ""}
                        ariaLabel="시간"
                        className="program-number"
                        maxLength={20}
                        placeholder="14:00"
                        disabled={!canEdit}
                        onSave={(next) => onUpdateMatch(post.id, match.id, { time: next })}
                        errorMessage="시간을 수정하지 못했습니다."
                      /></td>
                      <td><ProgramAutosaveField
                        value={match.place ?? ""}
                        ariaLabel="장소"
                        maxLength={60}
                        disabled={!canEdit}
                        onSave={(next) => onUpdateMatch(post.id, match.id, { place: next })}
                        errorMessage="장소를 수정하지 못했습니다."
                      /></td>
                      <td><ProgramAutosaveField
                        value={match.teamA ?? ""}
                        ariaLabel="대진"
                        maxLength={60}
                        placeholder="1조"
                        disabled={!canEdit}
                        onSave={(next) => onUpdateMatch(post.id, match.id, { teamA: next })}
                        errorMessage="대진을 수정하지 못했습니다."
                      /></td>
                      <td><ProgramAutosaveField
                        value={match.teamB ?? ""}
                        ariaLabel="대진"
                        maxLength={60}
                        placeholder="2조"
                        disabled={!canEdit}
                        onSave={(next) => onUpdateMatch(post.id, match.id, { teamB: next })}
                        errorMessage="대진을 수정하지 못했습니다."
                      /></td>
                      <td><ProgramAutosaveField
                        value={match.result ?? ""}
                        ariaLabel="결과"
                        maxLength={80}
                        placeholder="승자·점수"
                        disabled={!canEdit}
                        onSave={(next) => onUpdateMatch(post.id, match.id, { result: next })}
                        errorMessage="결과를 수정하지 못했습니다."
                      /></td>
                      {canEdit && <td><button type="button" className="program-task-delete" disabled={busyId === match.id} aria-label={`${entry.round}라운드 경기 삭제`}
                        onClick={() => void run(match.id, async () => { await onDeleteMatch(post.id, match.id); undo.remember(`${entry.round}라운드 경기`, () => onRestoreMatch(post.id, match)); }, "경기를 삭제하지 못했습니다.")}><Trash aria-hidden="true" size={16} /></button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canEdit && (
              <button type="button" className="btn-secondary btn-sm" disabled={adding} onClick={() => void addMatch(entry.round)}>
                <Plus aria-hidden="true" size={15} /> {entry.round}라운드에 경기 추가
              </button>
            )}
          </div>
        ))
      )}

      {canEdit && (
        <button type="button" className="btn-secondary btn-sm program-bracket-add-round" disabled={adding}
          onClick={() => void addMatch(rounds.length === 0 ? 1 : nextMatchRound(post) + 1)}>
          <Plus aria-hidden="true" size={15} /> {rounds.length === 0 ? "1라운드 만들기" : `${nextMatchRound(post) + 1}라운드 추가`}
        </button>
      )}

      {undo.pending && (
        <ProgramUndoNotice label={undo.pending.label} busy={undo.busy} onUndo={() => void undo.undo()} onDismiss={undo.dismiss} />
      )}
    </section>
  );
}

// ── 게임·포스트 ──────────────────────────────────────────────

/** 표로 옮기기 전에 자유 입력으로 적어 둔 값 — 감추면 사라진 것처럼 보이므로 옮길 때까지 보여 준다. */
function PostLegacyText({
  post, canEdit, onUpdate,
}: {
  post: RetreatProgramPost;
  canEdit: boolean;
  onUpdate: (postId: string, data: Partial<RetreatProgramPost>) => Promise<void>;
}) {
  const { busyId, run } = useRowBusy();
  const entries = [
    { key: "materials" as const, label: "준비물", value: post.materials?.trim(), moveTo: "아래 준비물 표" },
    { key: "staffRoles" as const, label: "스탭 역할", value: post.staffRoles?.trim(), moveTo: "아래 역할 표" },
  ].filter((entry) => Boolean(entry.value));

  if (entries.length === 0) return null;

  return (
    <div className="program-legacy-note" role="status">
      <p>예전에 자유 입력으로 적어 둔 내용입니다. {entries.map((e) => e.label).join(", ")}은(는) 이제 표가 단일 원천이므로 옮긴 뒤 지워 주세요.</p>
      {entries.map((entry) => (
        <div key={entry.key}>
          <strong>{entry.label}</strong>
          <pre>{entry.value}</pre>
          {canEdit && (
            <button type="button" className="btn-secondary btn-sm" disabled={busyId === entry.key}
              onClick={() => void run(entry.key, () => onUpdate(post.id, { [entry.key]: "" }), `${entry.label}을(를) 지우지 못했습니다.`)}>
              {entry.moveTo}로 옮겼습니다. 지우기
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// 준비물·스탭 역할은 아래 표(items·roles)가 단일 원천이다. 자유 입력으로 다시 받지 않는다.
const POST_FIELDS = [
  { key: "concept", label: "컨셉", rows: 2, placeholder: "이 활동이 전하려는 장면·분위기" },
  { key: "rules", label: "규칙", rows: 6, placeholder: "1. 조별 대항\n2. 3라운드 진행…" },
  { key: "prepCautions", label: "준비 시 주의", rows: 3, placeholder: "물품을 미리 숨겨두기" },
  { key: "runCautions", label: "진행 시 주의", rows: 4, placeholder: "정해진 시각 이후 새 라운드 시작 금지" },
  { key: "extra", label: "기타 전달 사항", rows: 3, placeholder: "승패 보상, 컨셉 연기 요청 등" },
] as const;

export function ProgramPostsSection({
  posts, canEdit, onCreate, onCreateBulk, onUpdate, onDelete, onCreateMatch, onUpdateMatch, onDeleteMatch,
  itemsOf, rolesOf, onCreateItem, onUpdateItem, onDeleteItem, onCreateRole, onUpdateRole, onDeleteRole,
  onRestore, onRestoreItem, onRestoreRole, onRestoreMatch, onReorder,
}: {
  posts: RetreatProgramPost[];
  canEdit: boolean;
  itemsOf: (postId: string) => RetreatProgramItem[];
  rolesOf: (postId: string) => RetreatProgramRole[];
  onCreateItem: (name: string, order: number, postId: string) => Promise<void>;
  onUpdateItem: (itemId: string, data: Partial<RetreatProgramItem>) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onCreateRole: (role: string, order: number, postId: string) => Promise<void>;
  onUpdateRole: (roleId: string, data: Partial<RetreatProgramRole>) => Promise<void>;
  onDeleteRole: (roleId: string) => Promise<void>;
  onCreate: (name: string, order: number) => Promise<void>;
  onCreateBulk: (rows: Array<Omit<RetreatProgramPost, "id" | "createdAt" | "updatedAt">>) => Promise<void>;
  onUpdate: (postId: string, data: Partial<RetreatProgramPost>) => Promise<void>;
  onDelete: (postId: string) => Promise<void>;
  onCreateMatch: (postId: string, data: { round: number; order: number }) => Promise<void>;
  onUpdateMatch: (postId: string, matchId: string, data: Partial<RetreatProgramMatch>) => Promise<void>;
  onDeleteMatch: (postId: string, matchId: string) => Promise<void>;
  onRestore: (post: RetreatProgramPost) => Promise<void>;
  onRestoreItem: (item: RetreatProgramItem) => Promise<void>;
  onRestoreRole: (role: RetreatProgramRole) => Promise<void>;
  onRestoreMatch: (postId: string, match: RetreatProgramMatch) => Promise<void>;
  onReorder: (orderedIds: string[]) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [adding, setAdding] = useState(false);
  const { busyId, run } = useRowBusy();
  const { toast } = useUI();
  const undo = useProgramUndo();
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const bulkRows = parseProgramActivityPaste(bulkText);

  async function add() {
    const trimmed = name.trim();
    if (!trimmed || adding) return;
    setAdding(true);
    try {
      await onCreate(trimmed, posts.length + 1);
      setName("");
    } catch {
      toast("활동을 추가하지 못했습니다. 입력한 이름은 유지됩니다. 다시 시도해 주세요.", "error");
    } finally {
      setAdding(false);
    }
  }

  async function importBulk() {
    if (bulkRows.length === 0) return;
    setAdding(true);
    try {
      await onCreateBulk(bulkRows.map((row, index) => ({
        ...row,
        order: posts.length + index + 1,
        participationMode: "retreatGroup",
        scoreEnabled: false,
        testStatus: programActivityRequirements(row).test ? "needed" : "notNeeded",
      })));
      setBulkText("");
      toast(`${bulkRows.length}개 활동을 추가했습니다.`, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "활동을 한꺼번에 추가하지 못했습니다.", "error");
    } finally {
      setAdding(false);
    }
  }

  async function move(postId: string, direction: -1 | 1) {
    const orderedIds = moveProgramPostOrder(posts, postId, direction);
    if (orderedIds.every((id, index) => id === posts[index]?.id)) return;
    setReorderingId(postId);
    try {
      await onReorder(orderedIds);
      toast("진행 순서를 바꿨습니다.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "진행 순서를 바꾸지 못했습니다.", "error");
    } finally {
      setReorderingId(null);
    }
  }

  return (
    <section className="program-form-section" aria-labelledby="program-posts-heading">
      <div className="program-subsection-heading">
        <div>
          <h3 id="program-posts-heading">진행 블록</h3>
        </div>
        <span className="program-count">{posts.length}개</span>
      </div>

      {canEdit && (
        <><div className="program-inline-form">
          <label className="program-field program-field--wide">
            <span>활동 이름</span>
            <input id="program-new-block-name" className="input" disabled={adding} value={name} maxLength={80} placeholder="예: 전체 오프닝 / 물코기 / 코스 이동"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void add(); } }} />
          </label>
          <button type="button" className="btn-secondary" disabled={adding || !name.trim()} onClick={() => void add()}>
            <Plus aria-hidden="true" size={16} /> 추가
          </button>
        </div>
        <details className="program-bulk-paste">
          <summary>스프레드시트에서 여러 활동 붙여넣기</summary>
          <div>
            <p>열 순서: 활동명 · 종류 · 운영 방식 · 장소 · 시작 · 종료 · 담당 (최대 100행)</p>
            <textarea className="input" rows={6} value={bulkText} onChange={(event) => setBulkText(event.target.value)} placeholder={"활동명\t종류\t운영 방식\t장소\t시작\t종료\t담당\n전체 오프닝\t브리핑·설명\t전체 진행\t본당\t14:00\t14:10\t홍길동"} />
            {bulkRows.length > 0 && <div className="program-bulk-paste__preview"><strong>{bulkRows.length}개 활동</strong><span>{bulkRows.slice(0, 3).map((row) => row.name).join(" · ")}{bulkRows.length > 3 ? ` 외 ${bulkRows.length - 3}개` : ""}</span></div>}
            <button type="button" className="btn-primary" disabled={adding || bulkRows.length === 0} onClick={() => void importBulk()}>{adding ? "추가 중…" : `${bulkRows.length}개 활동 추가`}</button>
          </div>
        </details></>
      )}

      <ProgramRunOfShow
        posts={posts}
        itemsOf={itemsOf}
        rolesOf={rolesOf}
        canEdit={canEdit}
        busyId={reorderingId}
        onMove={(postId, direction) => void move(postId, direction)}
      />

      {posts.length === 0 ? (
        <p className="program-task-empty">아직 진행 블록이 없습니다.</p>
      ) : (
        <ul className="program-card-list">
          {posts.map((post, index) => {
            const requirements = programActivityRequirements(post);
            return (
            <li key={post.id}>
              <details className="program-card" id={`program-block-${post.id}`}>
                <summary>
                  <b className="program-card-sequence" aria-hidden="true">{String(index + 1).padStart(2, "0")}</b>
                  <strong>{post.name}</strong>
                  <span>{PROGRAM_ACTIVITY_TYPE_META[programActivityType(post)].label} · {PROGRAM_OPERATION_MODE_META[programOperationMode(post)].label} / {PROGRAM_PARTICIPATION_MODE_META[programParticipationMode(post)]}</span>
                  <em className="program-card-counts">준비물 {itemsOf(post.id).length} / 역할 {rolesOf(post.id).length}</em>
                  <CaretDown className="program-card-caret" aria-hidden="true" size={17} weight="bold" />
                </summary>
                <fieldset disabled={!canEdit || busyId === post.id} className="program-card-body">
                  <div className="program-form-grid">
                    <label className="program-field program-field--wide"><span>블록 이름</span>
                      <ProgramAutosaveField
                        value={post.name}
                        ariaLabel="블록 이름"
                        maxLength={80}
                        allowEmpty={false}
                        onSave={(next) => onUpdate(post.id, { name: next })}
                        errorMessage="블록 이름을 수정하지 못했습니다."
                      /></label>
                    <label className="program-field"><span>활동 종류</span>
                      <select className="input" value={programActivityType(post)}
                        onChange={(event) => void run(post.id, () => onUpdate(post.id, { activityType: event.target.value as RetreatProgramActivityType }), "활동 종류를 바꾸지 못했습니다.")}>
                        {Object.entries(PROGRAM_ACTIVITY_TYPE_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
                      </select>
                    </label>
                    <label className="program-field"><span>운영 방식</span>
                      <select className="input" value={programOperationMode(post)}
                        onChange={(event) => void run(post.id, () => onUpdate(post.id, {
                          operationMode: event.target.value as RetreatProgramOperationMode,
                          ...(event.target.value === "alliance" ? { participationMode: "allianceTeam" as const } : {}),
                        }), "운영 방식을 바꾸지 못했습니다.")}>
                        {Object.entries(PROGRAM_OPERATION_MODE_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}: {meta.description}</option>)}
                      </select>
                    </label>
                    <label className="program-field"><span>참가 단위</span>
                      <select className="input" value={programParticipationMode(post)}
                        onChange={(event) => void run(post.id, () => onUpdate(post.id, { participationMode: event.target.value as RetreatProgramParticipationMode }), "참가 단위를 바꾸지 못했습니다.")}>
                        {Object.entries(PROGRAM_PARTICIPATION_MODE_META).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <label className="program-score-toggle">
                      <input type="checkbox" checked={post.scoreEnabled ?? false}
                        onChange={(event) => void run(post.id, () => onUpdate(post.id, { scoreEnabled: event.target.checked }), "점수 사용 설정을 바꾸지 못했습니다.")} />
                      <span>점수·대진 사용</span>
                    </label>
                    <label className="program-field"><span>장소</span>
                      <ProgramAutosaveField
                        value={post.place ?? ""}
                        ariaLabel="장소"
                        maxLength={80}
                        placeholder="B2 강당 1"
                        onSave={(next) => onUpdate(post.id, { place: next })}
                        errorMessage="장소를 수정하지 못했습니다."
                      /></label>
                    <label className="program-field"><span>러닝 타임</span>
                      <ProgramAutosaveField
                        value={post.duration ?? ""}
                        ariaLabel="시간"
                        maxLength={40}
                        placeholder="15m"
                        onSave={(next) => onUpdate(post.id, { duration: next })}
                        errorMessage="시간을 수정하지 못했습니다."
                      /></label>
                    <label className="program-field"><span>시작 시각</span>
                      <ProgramAutosaveField
                        value={post.startTime ?? ""}
                        ariaLabel="시작 시각"
                        placeholder="14:20"
                        maxLength={5}
                        onSave={(next) => onUpdate(post.id, { startTime: next })}
                        errorMessage="시작 시각을 수정하지 못했습니다."
                      /></label>
                    <label className="program-field"><span>종료 시각</span>
                      <ProgramAutosaveField
                        value={post.endTime ?? ""}
                        ariaLabel="종료 시각"
                        placeholder="14:35"
                        maxLength={5}
                        onSave={(next) => onUpdate(post.id, { endTime: next })}
                        errorMessage="종료 시각을 수정하지 못했습니다."
                      /></label>
                    <label className="program-field"><span>참여 인원</span>
                      <ProgramAutosaveField
                        value={post.headcount ?? ""}
                        ariaLabel="인원"
                        maxLength={120}
                        placeholder="라운드당 8명"
                        onSave={(next) => onUpdate(post.id, { headcount: next })}
                        errorMessage="인원을 수정하지 못했습니다."
                      /></label>
                    <label className="program-field"><span>진행 스탭</span>
                      <ProgramAutosaveField
                        value={post.staff ?? ""}
                        ariaLabel="담당"
                        maxLength={120}
                        onSave={(next) => onUpdate(post.id, { staff: next })}
                        errorMessage="담당을 수정하지 못했습니다."
                      /></label>
                    <label className="program-field"><span>힌트</span>
                      <ProgramAutosaveField
                        value={post.hint ?? ""}
                        ariaLabel="힌트"
                        maxLength={200}
                        placeholder="메인 힌트 1"
                        onSave={(next) => onUpdate(post.id, { hint: next })}
                        errorMessage="힌트를 수정하지 못했습니다."
                      /></label>
                    <label className="program-field"><span>사전 테스트 {requirements.test ? "(필수)" : "(선택)"}</span>
                      <select id={`program-post-test-${post.id}`} className="input" value={post.testStatus ?? (requirements.test ? "needed" : "notNeeded")}
                        onChange={(event) => void run(post.id, () => onUpdate(post.id, { testStatus: event.target.value as NonNullable<RetreatProgramPost["testStatus"]> }), "테스트 상태를 바꾸지 못했습니다.")}>
                        <option value="notNeeded">테스트 불필요</option>
                        <option value="needed">테스트 필요</option>
                        <option value="testing">테스트 중</option>
                        <option value="passed">테스트 완료</option>
                      </select>
                    </label>
                    <label className="program-field program-field--wide"><span>막힌 준비</span>
                      <ProgramAutosaveField
                        id={`program-post-blocker-${post.id}`}
                        value={post.blocker ?? ""}
                        ariaLabel="막힌 준비"
                        maxLength={240}
                        placeholder="예: 장소 사용 승인 대기 · 음향 장비 수량 확인 필요"
                        onSave={(next) => onUpdate(post.id, { blocker: next })}
                        errorMessage="막힌 준비를 저장하지 못했습니다."
                      />
                    </label>
                  </div>
                  <div className="program-text-fields">
                    {POST_FIELDS.map((field) => (
                      <label key={field.key} className="program-field">
                        <span>{field.label}</span>
                        <ProgramAutosaveField
                        id={`program-post-${field.key}-${post.id}`}
                        value={(post[field.key] as string | undefined) ?? ""}
                        ariaLabel={field.label}
                        maxLength={4000}
                        rows={field.rows}
                        placeholder={field.placeholder}
                        multiline
                        onSave={(next) => onUpdate(post.id, { [field.key]: next })}
                        errorMessage="내용을 수정하지 못했습니다."
                      />
                      </label>
                    ))}
                  </div>
                  <PostLegacyText post={post} canEdit={canEdit} onUpdate={onUpdate} />
                  <PostSubEntries
                    post={post} items={itemsOf(post.id)} roles={rolesOf(post.id)} canEdit={canEdit}
                    onCreateItem={onCreateItem} onUpdateItem={onUpdateItem} onDeleteItem={onDeleteItem}
                    onCreateRole={onCreateRole} onUpdateRole={onUpdateRole} onDeleteRole={onDeleteRole}
                    onRestoreItem={onRestoreItem} onRestoreRole={onRestoreRole}
                  />
                  {(post.scoreEnabled || postMatchRounds(post).length > 0) && (
                    <ProgramBracket post={post} canEdit={canEdit}
                      onCreateMatch={onCreateMatch} onUpdateMatch={onUpdateMatch} onDeleteMatch={onDeleteMatch}
                      onRestoreMatch={onRestoreMatch} />
                  )}
                  {canEdit && (
                    <div className="program-card-actions">
                      <button type="button" className="btn-danger btn-sm" onClick={() => void run(post.id, async () => { await onDelete(post.id); undo.remember(post.name, () => onRestore(post)); }, "활동을 삭제하지 못했습니다.")}>
                        <Trash aria-hidden="true" size={15} /> 이 블록 삭제
                      </button>
                    </div>
                  )}
                </fieldset>
              </details>
            </li>
            );
          })}
        </ul>
      )}

      {undo.pending && (
        <ProgramUndoNotice label={undo.pending.label} busy={undo.busy} onUndo={() => void undo.undo()} onDismiss={undo.dismiss} />
      )}
    </section>
  );
}

// ── 역할·배치 (모아 보기) ────────────────────────────────────
// 입력은 게임 카드 안에서 한다. 여기는 게임별로 묶어 한눈에 보고, 프로그램 전체 역할을 더하는 자리다.
export function ProgramRolesSection({
  groups, canEdit, onCreate, onUpdate, onDelete, onRestore,
}: {
  groups: Array<ProgramGroupedEntries<RetreatProgramRole>>;
  canEdit: boolean;
  onCreate: (role: string, order: number, postId?: string) => Promise<void>;
  onUpdate: (roleId: string, data: Partial<RetreatProgramRole>) => Promise<void>;
  onDelete: (roleId: string) => Promise<void>;
  onRestore: (role: RetreatProgramRole) => Promise<void>;
}) {
  const [role, setRole] = useState("");
  const { busyId, run } = useRowBusy();
  const undo = useProgramUndo();
  const total = groups.reduce((sum, group) => sum + group.entries.length, 0);
  const addRole = () => {
    if (!role.trim() || busyId) return;
    void run("create-role", async () => { await onCreate(role.trim(), total + 1); setRole(""); }, "역할을 추가하지 못했습니다.");
  };

  return (
    <section className="program-form-section" aria-labelledby="program-roles-heading">
      <div className="program-subsection-heading">
        <div>
          <h3 id="program-roles-heading">역할·배치</h3>
        </div>
        <span className="program-count">{total}명</span>
      </div>

      {canEdit && (
        <div className="program-inline-form">
          <label className="program-field program-field--wide">
            <span>프로그램 전체 역할</span>
            <input className="input" disabled={busyId !== null} value={role} maxLength={80} placeholder="예: 총괄 / 타임키퍼"
              onChange={(event) => setRole(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addRole(); } }} />
          </label>
          <button type="button" className="btn-secondary" disabled={busyId !== null || !role.trim()}
            onClick={addRole}>
            <Plus aria-hidden="true" size={16} /> 추가
          </button>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.postId ?? "common"} className="program-group">
          <div className="program-group-heading">
            <h4>{group.label}</h4>
            <span>{group.entries.length}명</span>
          </div>
          {group.entries.length === 0 ? (
            <p className="program-task-empty">{group.postId ? "이 활동에 배정된 역할이 없습니다." : "프로그램 전체 역할이 없습니다."}</p>
          ) : (
            <div className="program-table-scroll program-table-scroll--adaptive">
              <table className="program-table program-table--adaptive">
                <thead><tr><th>역할</th><th>담당</th><th>장소</th><th>인원</th><th>세부 내용</th>{canEdit && <th aria-label="삭제" />}</tr></thead>
                <tbody>
                  {group.entries.map((entry) => (
                    <tr key={entry.id} aria-busy={busyId === entry.id}>
                      <td data-label="역할" className="program-adaptive-cell--wide"><ProgramAutosaveField
                        value={entry.role}
                        ariaLabel="역할"
                        maxLength={80}
                        allowEmpty={false}
                        disabled={!canEdit}
                        onSave={(next) => onUpdate(entry.id, { role: next })}
                        errorMessage="역할을 수정하지 못했습니다."
                      /></td>
                      <td data-label="담당"><ProgramAutosaveField
                        value={entry.assignee ?? ""}
                        ariaLabel="담당"
                        maxLength={120}
                        disabled={!canEdit}
                        onSave={(next) => onUpdate(entry.id, { assignee: next })}
                        errorMessage="담당을 수정하지 못했습니다."
                      /></td>
                      <td data-label="장소"><ProgramAutosaveField
                        value={entry.place ?? ""}
                        ariaLabel="장소"
                        maxLength={80}
                        disabled={!canEdit}
                        onSave={(next) => onUpdate(entry.id, { place: next })}
                        errorMessage="장소를 수정하지 못했습니다."
                      /></td>
                      <td data-label="인원"><ProgramAutosaveField
                        value={entry.headcount ?? ""}
                        ariaLabel="인원"
                        className="program-number"
                        maxLength={40}
                        disabled={!canEdit}
                        onSave={(next) => onUpdate(entry.id, { headcount: next })}
                        errorMessage="인원을 수정하지 못했습니다."
                      /></td>
                      <td data-label="세부 내용" className="program-adaptive-cell--wide"><ProgramAutosaveField
                        value={entry.detail ?? ""}
                        ariaLabel="내용"
                        maxLength={400}
                        disabled={!canEdit}
                        onSave={(next) => onUpdate(entry.id, { detail: next })}
                        errorMessage="내용을 수정하지 못했습니다."
                      /></td>
                      {canEdit && <td data-label="행 삭제" className="program-adaptive-action"><button type="button" className="program-task-delete" disabled={busyId === entry.id} aria-label={`${entry.role} 삭제`}
                        onClick={() => void run(entry.id, async () => { await onDelete(entry.id); undo.remember(entry.role, () => onRestore(entry)); }, "역할을 삭제하지 못했습니다.")}><Trash aria-hidden="true" size={16} /></button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {undo.pending && (
        <ProgramUndoNotice label={undo.pending.label} busy={undo.busy} onUndo={() => void undo.undo()} onDismiss={undo.dismiss} />
      )}
    </section>
  );
}

// ── 물품·예산 (모아 보기 · 구매 체크) ──────────────────────────
export function ProgramItemsSection({
  groups, canEdit, onCreate, onUpdate, onDelete, onRestore,
}: {
  groups: Array<ProgramGroupedEntries<RetreatProgramItem>>;
  canEdit: boolean;
  onCreate: (name: string, order: number, postId?: string) => Promise<void>;
  onUpdate: (itemId: string, data: Partial<RetreatProgramItem>) => Promise<void>;
  onDelete: (itemId: string) => Promise<void>;
  onRestore: (item: RetreatProgramItem) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const { busyId, run } = useRowBusy();
  const undo = useProgramUndo();
  const all = groups.flatMap((group) => group.entries);
  const budget = programBudget(all);
  const addItem = () => {
    if (!name.trim() || busyId) return;
    void run("create-item", async () => { await onCreate(name.trim(), all.length + 1); setName(""); }, "준비물을 추가하지 못했습니다.");
  };

  return (
    <section className="program-form-section" aria-labelledby="program-items-heading">
      <div className="program-subsection-heading">
        <div>
          <h3 id="program-items-heading">물품·예산</h3>
        </div>
        <span className="program-count">{all.length}건</span>
      </div>

      <div className="program-budget" aria-label="예산 요약">
        <div><span>구매 완료</span><strong>{won(budget.spent)}</strong></div>
        <div><span>구매 예정</span><strong>{won(budget.planned)}</strong></div>
        <div className="program-budget--total"><span>합계</span><strong>{won(budget.total)}</strong></div>
      </div>

      {canEdit && (
        <div className="program-inline-form">
          <label className="program-field program-field--wide">
            <span>프로그램 공통 물품</span>
            <input className="input" disabled={busyId !== null} value={name} maxLength={80} placeholder="예: 현수막"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addItem(); } }} />
          </label>
          <button type="button" className="btn-secondary" disabled={busyId !== null || !name.trim()}
            onClick={addItem}>
            <Plus aria-hidden="true" size={16} /> 추가
          </button>
        </div>
      )}

      {groups.map((group) => {
        const groupBudget = programBudget(group.entries);
        return (
          <div key={group.postId ?? "common"} className="program-group">
            <div className="program-group-heading">
              <h4>{group.label}</h4>
              <span>{group.entries.length}건 / {won(groupBudget.total)}</span>
            </div>
            {group.entries.length === 0 ? (
              <p className="program-task-empty">{group.postId ? "이 활동의 준비물이 없습니다." : "공통 물품이 없습니다."}</p>
            ) : (
              <div className="program-table-scroll program-table-scroll--adaptive">
                <table className="program-table program-table--adaptive">
                  <thead><tr><th>상태</th><th>이름</th><th>수량</th><th>단가</th><th>금액</th>{canEdit && <th aria-label="삭제" />}</tr></thead>
                  <tbody>
                    {group.entries.map((item) => (
                      <tr key={item.id} aria-busy={busyId === item.id}>
                        <td data-label="상태"><select className="input" value={item.status} disabled={!canEdit}
                          onChange={(event) => void run(item.id, () => onUpdate(item.id, { status: event.target.value as RetreatProgramItemStatus }), "상태를 바꾸지 못했습니다.")}>
                          {Object.entries(PROGRAM_ITEM_STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
                        </select></td>
                        <td data-label="이름" className="program-adaptive-cell--wide"><ProgramAutosaveField
                        value={item.name}
                        ariaLabel="이름"
                        maxLength={80}
                        allowEmpty={false}
                        disabled={!canEdit}
                        onSave={(next) => onUpdate(item.id, { name: next })}
                        errorMessage="이름을 수정하지 못했습니다."
                      /></td>
                        <td data-label="수량"><ProgramAutosaveField
                        value={item.quantity ?? ""}
                        ariaLabel="수량"
                        className="program-number"
                        inputMode="numeric"
                        disabled={!canEdit}
                        onSave={(next) => onUpdate(item.id, { quantity: digits(next) ?? null as never })}
                        errorMessage="수량을 수정하지 못했습니다."
                      /></td>
                        <td data-label="단가"><ProgramAutosaveField
                        value={item.unitPrice ?? ""}
                        ariaLabel="단가"
                        className="program-number"
                        inputMode="numeric"
                        disabled={!canEdit}
                        onSave={(next) => onUpdate(item.id, { unitPrice: digits(next) ?? null as never })}
                        errorMessage="단가를 수정하지 못했습니다."
                      /></td>
                        <td data-label="금액" className="program-money">{won(programItemTotal(item))}</td>
                        {canEdit && <td data-label="행 삭제" className="program-adaptive-action"><button type="button" className="program-task-delete" disabled={busyId === item.id} aria-label={`${item.name} 삭제`}
                          onClick={() => void run(item.id, async () => { await onDelete(item.id); undo.remember(item.name, () => onRestore(item)); }, "물품을 삭제하지 못했습니다.")}><Trash aria-hidden="true" size={16} /></button></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {undo.pending && (
        <ProgramUndoNotice label={undo.pending.label} busy={undo.busy} onUndo={() => void undo.undo()} onDismiss={undo.dismiss} />
      )}
    </section>
  );
}
