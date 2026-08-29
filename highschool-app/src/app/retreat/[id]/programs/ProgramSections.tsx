"use client";

import { useState } from "react";
import { Plus, Trash } from "@phosphor-icons/react";
import { useUI } from "@/context/UIContext";
import {
  PROGRAM_ITEM_STATUS_META,
  nextMatchRound,
  postMatchRounds,
  programBudget,
  programItemTotal,
} from "@/lib/programPreparation";
import type {
  RetreatProgramItem,
  RetreatProgramItemStatus,
  RetreatProgramMatch,
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


// ── 대진표 (게임 카드 안) ───────────────────────────────────────
function ProgramBracket({
  post, canEdit, onCreateMatch, onUpdateMatch, onDeleteMatch,
}: {
  post: RetreatProgramPost;
  canEdit: boolean;
  onCreateMatch: (postId: string, data: { round: number; order: number }) => Promise<void>;
  onUpdateMatch: (postId: string, matchId: string, data: Partial<RetreatProgramMatch>) => Promise<void>;
  onDeleteMatch: (postId: string, matchId: string) => Promise<void>;
}) {
  const { busyId, run } = useRowBusy();
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
          <p>운동회·대진형 게임에서만 쓰면 됩니다. 라운드를 늘려 가며 경기를 추가하세요.</p>
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
                      <td><input className="input program-number" defaultValue={match.time ?? ""} maxLength={20} disabled={!canEdit} placeholder="14:00"
                        onBlur={(event) => { if (event.target.value !== (match.time ?? "")) void run(match.id, () => onUpdateMatch(post.id, match.id, { time: event.target.value }), "시간을 수정하지 못했습니다."); }} /></td>
                      <td><input className="input" defaultValue={match.place ?? ""} maxLength={60} disabled={!canEdit}
                        onBlur={(event) => { if (event.target.value !== (match.place ?? "")) void run(match.id, () => onUpdateMatch(post.id, match.id, { place: event.target.value }), "장소를 수정하지 못했습니다."); }} /></td>
                      <td><input className="input" defaultValue={match.teamA ?? ""} maxLength={60} disabled={!canEdit} placeholder="1조"
                        onBlur={(event) => { if (event.target.value !== (match.teamA ?? "")) void run(match.id, () => onUpdateMatch(post.id, match.id, { teamA: event.target.value }), "대진을 수정하지 못했습니다."); }} /></td>
                      <td><input className="input" defaultValue={match.teamB ?? ""} maxLength={60} disabled={!canEdit} placeholder="2조"
                        onBlur={(event) => { if (event.target.value !== (match.teamB ?? "")) void run(match.id, () => onUpdateMatch(post.id, match.id, { teamB: event.target.value }), "대진을 수정하지 못했습니다."); }} /></td>
                      <td><input className="input" defaultValue={match.result ?? ""} maxLength={80} disabled={!canEdit} placeholder="승자·점수"
                        onBlur={(event) => { if (event.target.value !== (match.result ?? "")) void run(match.id, () => onUpdateMatch(post.id, match.id, { result: event.target.value }), "결과를 수정하지 못했습니다."); }} /></td>
                      {canEdit && <td><button type="button" className="program-task-delete" disabled={busyId === match.id} aria-label={`${entry.round}라운드 경기 삭제`}
                        onClick={() => void run(match.id, () => onDeleteMatch(post.id, match.id), "경기를 삭제하지 못했습니다.")}><Trash aria-hidden="true" size={16} /></button></td>}
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
    </section>
  );
}

// ── 게임·포스트 ──────────────────────────────────────────────
const POST_FIELDS = [
  { key: "concept", label: "컨셉", rows: 2, placeholder: "이 게임이 전하려는 장면·분위기" },
  { key: "rules", label: "규칙", rows: 6, placeholder: "1. 조별 대항\n2. 3라운드 진행…" },
  { key: "materials", label: "준비물", rows: 3, placeholder: "줄자 / 종이 / 펜" },
  { key: "staffRoles", label: "스탭 역할", rows: 3, placeholder: "진행스탭: 메인 진행, 점수 기록" },
  { key: "prepCautions", label: "준비 시 주의", rows: 3, placeholder: "물품을 미리 숨겨두기" },
  { key: "runCautions", label: "진행 시 주의", rows: 4, placeholder: "정해진 시각 이후 새 라운드 시작 금지" },
  { key: "extra", label: "기타 전달 사항", rows: 3, placeholder: "승패 보상, 컨셉 연기 요청 등" },
] as const;

export function ProgramPostsSection({
  posts, canEdit, onCreate, onUpdate, onDelete, onCreateMatch, onUpdateMatch, onDeleteMatch,
}: {
  posts: RetreatProgramPost[];
  canEdit: boolean;
  onCreate: (name: string, order: number) => Promise<void>;
  onUpdate: (postId: string, data: Partial<RetreatProgramPost>) => Promise<void>;
  onDelete: (postId: string) => Promise<void>;
  onCreateMatch: (postId: string, data: { round: number; order: number }) => Promise<void>;
  onUpdateMatch: (postId: string, matchId: string, data: Partial<RetreatProgramMatch>) => Promise<void>;
  onDeleteMatch: (postId: string, matchId: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const { busyId, run } = useRowBusy();

  async function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      await onCreate(trimmed, posts.length + 1);
      setName("");
    } finally {
      setAdding(false);
    }
  }

  return (
    <section className="program-form-section" aria-labelledby="program-posts-heading">
      <div className="program-subsection-heading">
        <div>
          <h3 id="program-posts-heading">게임·포스트</h3>
          <p>게임 하나가 카드 하나입니다. 현장 스탭이 이 카드만 보고 진행할 수 있어야 합니다.</p>
        </div>
        <span className="program-count">{posts.length}개</span>
      </div>

      {canEdit && (
        <div className="program-inline-form">
          <label className="program-field program-field--wide">
            <span>게임 이름</span>
            <input className="input" value={name} maxLength={80} placeholder="예: 물코기(이천규빗)"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void add(); } }} />
          </label>
          <button type="button" className="btn-secondary" disabled={adding || !name.trim()} onClick={() => void add()}>
            <Plus aria-hidden="true" size={16} /> 추가
          </button>
        </div>
      )}

      {posts.length === 0 ? (
        <p className="program-task-empty">아직 등록된 게임이 없습니다. 위에서 이름부터 추가해 주세요.</p>
      ) : (
        <ul className="program-card-list">
          {posts.map((post) => (
            <li key={post.id}>
              <details className="program-card">
                <summary>
                  <strong>{post.name}</strong>
                  <span>{[post.place, post.duration, post.staff].filter(Boolean).join(" · ") || "장소·시간·담당 미정"}</span>
                </summary>
                <fieldset disabled={!canEdit || busyId === post.id} className="program-card-body">
                  <div className="program-form-grid">
                    <label className="program-field program-field--wide"><span>게임 이름</span>
                      <input className="input" defaultValue={post.name} maxLength={80}
                        onBlur={(event) => { if (event.target.value.trim() && event.target.value !== post.name) void run(post.id, () => onUpdate(post.id, { name: event.target.value.trim() }), "게임을 수정하지 못했습니다."); }} /></label>
                    <label className="program-field"><span>장소</span>
                      <input className="input" defaultValue={post.place ?? ""} maxLength={80} placeholder="B2 강당 1"
                        onBlur={(event) => { if (event.target.value !== (post.place ?? "")) void run(post.id, () => onUpdate(post.id, { place: event.target.value }), "장소를 수정하지 못했습니다."); }} /></label>
                    <label className="program-field"><span>러닝 타임</span>
                      <input className="input" defaultValue={post.duration ?? ""} maxLength={40} placeholder="15m"
                        onBlur={(event) => { if (event.target.value !== (post.duration ?? "")) void run(post.id, () => onUpdate(post.id, { duration: event.target.value }), "시간을 수정하지 못했습니다."); }} /></label>
                    <label className="program-field"><span>참여 인원</span>
                      <input className="input" defaultValue={post.headcount ?? ""} maxLength={120} placeholder="라운드당 8명"
                        onBlur={(event) => { if (event.target.value !== (post.headcount ?? "")) void run(post.id, () => onUpdate(post.id, { headcount: event.target.value }), "인원을 수정하지 못했습니다."); }} /></label>
                    <label className="program-field"><span>진행 스탭</span>
                      <input className="input" defaultValue={post.staff ?? ""} maxLength={120}
                        onBlur={(event) => { if (event.target.value !== (post.staff ?? "")) void run(post.id, () => onUpdate(post.id, { staff: event.target.value }), "담당을 수정하지 못했습니다."); }} /></label>
                    <label className="program-field"><span>힌트</span>
                      <input className="input" defaultValue={post.hint ?? ""} maxLength={200} placeholder="메인 힌트 1"
                        onBlur={(event) => { if (event.target.value !== (post.hint ?? "")) void run(post.id, () => onUpdate(post.id, { hint: event.target.value }), "힌트를 수정하지 못했습니다."); }} /></label>
                  </div>
                  <div className="program-text-fields">
                    {POST_FIELDS.map((field) => (
                      <label key={field.key} className="program-field">
                        <span>{field.label}</span>
                        <textarea className="input" rows={field.rows} maxLength={4000} placeholder={field.placeholder}
                          defaultValue={(post[field.key] as string | undefined) ?? ""}
                          onBlur={(event) => { if (event.target.value !== ((post[field.key] as string | undefined) ?? "")) void run(post.id, () => onUpdate(post.id, { [field.key]: event.target.value }), "내용을 수정하지 못했습니다."); }} />
                      </label>
                    ))}
                  </div>
                  <ProgramBracket post={post} canEdit={canEdit}
                    onCreateMatch={onCreateMatch} onUpdateMatch={onUpdateMatch} onDeleteMatch={onDeleteMatch} />
                  {canEdit && (
                    <div className="program-card-actions">
                      <span className="program-autosave-hint">입력한 칸에서 벗어나면 바로 저장됩니다.</span>
                      <button type="button" className="btn-danger btn-sm" onClick={() => void run(post.id, () => onDelete(post.id), "게임을 삭제하지 못했습니다.")}>
                        <Trash aria-hidden="true" size={15} /> 이 게임 삭제
                      </button>
                    </div>
                  )}
                </fieldset>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── 역할·배치 ───────────────────────────────────────────────
export function ProgramRolesSection({
  roles, canEdit, onCreate, onUpdate, onDelete,
}: {
  roles: RetreatProgramRole[];
  canEdit: boolean;
  onCreate: (role: string, order: number) => Promise<void>;
  onUpdate: (roleId: string, data: Partial<RetreatProgramRole>) => Promise<void>;
  onDelete: (roleId: string) => Promise<void>;
}) {
  const [role, setRole] = useState("");
  const [adding, setAdding] = useState(false);
  const { busyId, run } = useRowBusy();

  async function add() {
    const trimmed = role.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      await onCreate(trimmed, roles.length + 1);
      setRole("");
    } finally {
      setAdding(false);
    }
  }

  return (
    <section className="program-form-section" aria-labelledby="program-roles-heading">
      <div className="program-subsection-heading">
        <div>
          <h3 id="program-roles-heading">역할·배치</h3>
          <p>누가 어디서 무엇을 맡는지. 교사 브리핑에 그대로 옮겨 쓸 수 있게 적어 주세요.</p>
        </div>
        <span className="program-count">{roles.length}명</span>
      </div>

      {canEdit && (
        <div className="program-inline-form">
          <label className="program-field program-field--wide">
            <span>역할</span>
            <input className="input" value={role} maxLength={80} placeholder="예: 진행 / 소통 / 타임키퍼"
              onChange={(event) => setRole(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void add(); } }} />
          </label>
          <button type="button" className="btn-secondary" disabled={adding || !role.trim()} onClick={() => void add()}>
            <Plus aria-hidden="true" size={16} /> 추가
          </button>
        </div>
      )}

      {roles.length === 0 ? (
        <p className="program-task-empty">아직 등록된 역할이 없습니다.</p>
      ) : (
        <div className="program-table-scroll">
          <table className="program-table">
            <thead>
              <tr><th>역할</th><th>담당</th><th>장소</th><th>인원</th><th>세부 내용</th>{canEdit && <th aria-label="삭제" />}</tr>
            </thead>
            <tbody>
              {roles.map((entry) => (
                <tr key={entry.id} aria-busy={busyId === entry.id}>
                  <td><input className="input" defaultValue={entry.role} maxLength={80} disabled={!canEdit}
                    onBlur={(event) => { if (event.target.value.trim() && event.target.value !== entry.role) void run(entry.id, () => onUpdate(entry.id, { role: event.target.value.trim() }), "역할을 수정하지 못했습니다."); }} /></td>
                  <td><input className="input" defaultValue={entry.assignee ?? ""} maxLength={120} disabled={!canEdit}
                    onBlur={(event) => { if (event.target.value !== (entry.assignee ?? "")) void run(entry.id, () => onUpdate(entry.id, { assignee: event.target.value }), "담당을 수정하지 못했습니다."); }} /></td>
                  <td><input className="input" defaultValue={entry.place ?? ""} maxLength={80} disabled={!canEdit}
                    onBlur={(event) => { if (event.target.value !== (entry.place ?? "")) void run(entry.id, () => onUpdate(entry.id, { place: event.target.value }), "장소를 수정하지 못했습니다."); }} /></td>
                  <td><input className="input" defaultValue={entry.headcount ?? ""} maxLength={40} disabled={!canEdit}
                    onBlur={(event) => { if (event.target.value !== (entry.headcount ?? "")) void run(entry.id, () => onUpdate(entry.id, { headcount: event.target.value }), "인원을 수정하지 못했습니다."); }} /></td>
                  <td><input className="input" defaultValue={entry.detail ?? ""} maxLength={400} disabled={!canEdit}
                    onBlur={(event) => { if (event.target.value !== (entry.detail ?? "")) void run(entry.id, () => onUpdate(entry.id, { detail: event.target.value }), "내용을 수정하지 못했습니다."); }} /></td>
                  {canEdit && <td><button type="button" className="program-task-delete" disabled={busyId === entry.id} aria-label={`${entry.role} 삭제`}
                    onClick={() => void run(entry.id, () => onDelete(entry.id), "역할을 삭제하지 못했습니다.")}><Trash aria-hidden="true" size={16} /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── 물품·예산 ───────────────────────────────────────────────
export function ProgramItemsSection({
  items, canEdit, onCreate, onUpdate, onDelete,
}: {
  items: RetreatProgramItem[];
  canEdit: boolean;
  onCreate: (name: string, order: number) => Promise<void>;
  onUpdate: (itemId: string, data: Partial<RetreatProgramItem>) => Promise<void>;
  onDelete: (itemId: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const { busyId, run } = useRowBusy();
  const budget = programBudget(items);

  async function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      await onCreate(trimmed, items.length + 1);
      setName("");
    } finally {
      setAdding(false);
    }
  }

  function numberOrUndefined(value: string): number | undefined {
    const digits = value.replace(/[^0-9]/g, "");
    return digits ? Number(digits) : undefined;
  }

  return (
    <section className="program-form-section" aria-labelledby="program-items-heading">
      <div className="program-subsection-heading">
        <div>
          <h3 id="program-items-heading">물품·예산</h3>
          <p>수량과 단가를 넣으면 금액과 합계가 자동으로 계산됩니다.</p>
        </div>
        <span className="program-count">{items.length}건</span>
      </div>

      <div className="program-budget" aria-label="예산 요약">
        <div><span>구매 완료</span><strong>{won(budget.spent)}</strong></div>
        <div><span>구매 예정</span><strong>{won(budget.planned)}</strong></div>
        <div className="program-budget--total"><span>합계</span><strong>{won(budget.total)}</strong></div>
      </div>

      {canEdit && (
        <div className="program-inline-form">
          <label className="program-field program-field--wide">
            <span>물품 이름</span>
            <input className="input" value={name} maxLength={80} placeholder="예: 종이테이프"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void add(); } }} />
          </label>
          <button type="button" className="btn-secondary" disabled={adding || !name.trim()} onClick={() => void add()}>
            <Plus aria-hidden="true" size={16} /> 추가
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="program-task-empty">아직 등록된 물품이 없습니다.</p>
      ) : (
        <div className="program-table-scroll">
          <table className="program-table">
            <thead>
              <tr><th>상태</th><th>항목</th><th>이름</th><th>수량</th><th>단가</th><th>금액</th>{canEdit && <th aria-label="삭제" />}</tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} aria-busy={busyId === item.id}>
                  <td>
                    <select className="input" defaultValue={item.status} disabled={!canEdit}
                      onChange={(event) => void run(item.id, () => onUpdate(item.id, { status: event.target.value as RetreatProgramItemStatus }), "상태를 바꾸지 못했습니다.")}>
                      {Object.entries(PROGRAM_ITEM_STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
                    </select>
                  </td>
                  <td><input className="input" defaultValue={item.group ?? ""} maxLength={80} disabled={!canEdit} placeholder="게임 이름"
                    onBlur={(event) => { if (event.target.value !== (item.group ?? "")) void run(item.id, () => onUpdate(item.id, { group: event.target.value }), "항목을 수정하지 못했습니다."); }} /></td>
                  <td><input className="input" defaultValue={item.name} maxLength={80} disabled={!canEdit}
                    onBlur={(event) => { if (event.target.value.trim() && event.target.value !== item.name) void run(item.id, () => onUpdate(item.id, { name: event.target.value.trim() }), "이름을 수정하지 못했습니다."); }} /></td>
                  <td><input className="input program-number" inputMode="numeric" defaultValue={item.quantity ?? ""} disabled={!canEdit}
                    onBlur={(event) => { const next = numberOrUndefined(event.target.value); if (next !== item.quantity) void run(item.id, () => onUpdate(item.id, { quantity: next ?? null as never }), "수량을 수정하지 못했습니다."); }} /></td>
                  <td><input className="input program-number" inputMode="numeric" defaultValue={item.unitPrice ?? ""} disabled={!canEdit}
                    onBlur={(event) => { const next = numberOrUndefined(event.target.value); if (next !== item.unitPrice) void run(item.id, () => onUpdate(item.id, { unitPrice: next ?? null as never }), "단가를 수정하지 못했습니다."); }} /></td>
                  <td className="program-money">{won(programItemTotal(item))}</td>
                  {canEdit && <td><button type="button" className="program-task-delete" disabled={busyId === item.id} aria-label={`${item.name} 삭제`}
                    onClick={() => void run(item.id, () => onDelete(item.id), "물품을 삭제하지 못했습니다.")}><Trash aria-hidden="true" size={16} /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
