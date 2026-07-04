import { Group, IguardMeal, IguardMealEntry, IguardSeating, IguardSeatingZone } from "./types";

// ════════════════════════════════════════════════════════════
// 공정 배분 알고리즘
//
// 목적: 모든 조가 "식사 앞순서"와 "집회 앞자리"의 기회를 균등하게.
// 핵심: 식사 순서 + 집회 앞자리를 하나의 누적 "혜택 점수"로 합산.
//   - 점수가 낮은 조(= 그동안 손해 본 조)에게 다음 세션의 좋은 자리를 먼저 준다.
//   - 좋은 자리를 받으면 점수가 오른다 → 다음엔 뒤로 밀린다.
//   - 식사·집회 점수를 공유하므로 "집회 앞자리 받으면 밥은 뒷순서"가 자연히 성립.
// 시간순(일자·끼니/순서)으로 전 세션을 처리해 전체를 균등화.
// ════════════════════════════════════════════════════════════

export interface FairResult {
  meals: { id: string; entries: IguardMealEntry[] }[];
  seatings: { id: string; zones: IguardSeatingZone[] }[];
  summary: {
    groupId: string;
    mealFront: number; mealMid: number; mealBack: number; // 식사 앞/중간/뒤 구간 횟수
    avgMealRank: number;                                   // 평균 식사 순위(1=맨앞)
    seatFront: number;                                     // 집회 앞 구역 횟수
    score: number;                                         // 누적 혜택 점수
  }[];
  counts: { meals: number; seatings: number };
}

function groupKeys(group: Group): string[] {
  return [
    group.id,
    group.name,
    `${group.bu} ${group.name}`,
    `${group.bu}${group.name}`,
  ].map(v => v.replace(/\s+/g, "").toLowerCase());
}

// 맨 앞 고정 조 파싱 — "1조, 3조" 또는 줄바꿈 구분. 쉼표/줄바꿈 순서 그대로 앞순서(첫 조가 맨 앞).
// avoidPairs와 같은 groupKeys 매칭(조 id/이름/부+이름) 재사용. 매칭 안 되는 이름은 무시.
function parsePinnedFront(value: string | null | undefined, groups: Group[]): string[] {
  if (!value) return [];
  const byKey = new Map<string, string>();
  groups.forEach(g => groupKeys(g).forEach(key => byKey.set(key, g.id)));
  const seen = new Set<string>();
  const ids: string[] = [];
  value.split(/[\n,，]+/).map(v => v.replace(/\s+/g, "").toLowerCase()).filter(Boolean).forEach(token => {
    const id = byKey.get(token);
    if (id && !seen.has(id)) { seen.add(id); ids.push(id); }
  });
  return ids;
}

// 공정 배분 순서(ordered)에 맨 앞 고정 조를 앞으로 끌어와 최종 순서를 만든다.
// 고정 조도 앞자리 점수를 그대로 받으므로, 다음 비고정 세션에서는 공정하게 뒤로 밀린다.
function applyPinnedFront(ordered: Group[], pinnedIds: string[]): Group[] {
  if (pinnedIds.length === 0) return ordered;
  const byId = new Map(ordered.map(g => [g.id, g]));
  const pinned = pinnedIds.map(id => byId.get(id)).filter((g): g is Group => !!g);
  const pinnedSet = new Set(pinned.map(g => g.id));
  const rest = ordered.filter(g => !pinnedSet.has(g.id));
  return [...pinned, ...rest];
}

function parseAvoidPairs(value: string | null | undefined, groups: Group[]): [string, string][] {
  if (!value) return [];
  const byKey = new Map<string, string>();
  groups.forEach(g => groupKeys(g).forEach(key => byKey.set(key, g.id)));
  return value
    .split(/\n+/)
    .map(line => line.split(/[-–—,，/]+/).map(v => v.replace(/\s+/g, "").toLowerCase()).filter(Boolean))
    .filter(parts => parts.length >= 2)
    .map(parts => [byKey.get(parts[0]), byKey.get(parts[1])] as const)
    .filter((pair): pair is [string, string] => !!pair[0] && !!pair[1] && pair[0] !== pair[1]);
}

function zoneIndexOf(zones: IguardSeatingZone[], groupId: string): number {
  return zones.findIndex(z => (z.groupIds || []).includes(groupId));
}

function pairConflicts(zones: IguardSeatingZone[], pairs: [string, string][], groupId: string, targetZone: number): boolean {
  return pairs.some(([a, b]) => {
    const other = a === groupId ? b : b === groupId ? a : null;
    return other != null && (zones[targetZone]?.groupIds || []).includes(other);
  });
}

function separateAvoidPairs(zones: IguardSeatingZone[], pairs: [string, string][]): IguardSeatingZone[] {
  if (!pairs.length || zones.length < 2) return zones;
  const next = zones.map(z => ({ ...z, groupIds: [...(z.groupIds || [])] }));
  pairs.forEach(([a, b]) => {
    const zi = zoneIndexOf(next, a);
    if (zi < 0 || zi !== zoneIndexOf(next, b)) return;
    for (let target = next.length - 1; target >= 0; target--) {
      if (target === zi || pairConflicts(next, pairs, b, target)) continue;
      const swapIndex = next[target].groupIds.findIndex(candidate => !pairConflicts(next, pairs, candidate, zi));
      if (swapIndex < 0) continue;
      const sourceIndex = next[zi].groupIds.indexOf(b);
      const swapId = next[target].groupIds[swapIndex];
      next[zi].groupIds[sourceIndex] = swapId;
      next[target].groupIds[swapIndex] = b;
      return;
    }
  });
  return next;
}

function parseLayoutPattern(value: string | null | undefined): number[] {
  const normalized = (value || "").replace(/[×xX]/g, "*").replace(/[，,/\s]+/g, " ").trim();
  if (!normalized) return [];

  const star = normalized.match(/^(\d+)\s*\*\s*(\d+)$/);
  if (star) {
    const count = Number(star[1]);
    const repeat = Number(star[2]);
    if (Number.isFinite(count) && Number.isFinite(repeat) && count > 0 && repeat > 0) {
      return Array.from({ length: repeat }, () => count);
    }
  }

  if (/^\d+$/.test(normalized) && normalized.length > 1) {
    return normalized.split("").map(Number).filter(n => n > 0);
  }

  return normalized.split(" ").map(v => Number(v)).filter(n => Number.isFinite(n) && n > 0);
}

function seatingZonesFor(seat: IguardSeating, groups: Group[]): { zones: IguardSeatingZone[]; capacities: number[] } {
  const pattern = parseLayoutPattern(seat.layoutPattern);
  if (pattern.length > 0) {
    const zones = pattern.map((capacity, index) => {
      const existing = seat.zones?.[index];
      return { name: existing?.name || `${index + 1}열`, groupIds: [] };
    });
    const totalCapacity = pattern.reduce((sum, n) => sum + n, 0);
    if (totalCapacity < groups.length) {
      zones.push({ name: `${zones.length + 1}열`, groupIds: [] });
      return { zones, capacities: [...pattern, groups.length - totalCapacity] };
    }
    return { zones, capacities: pattern };
  }

  return {
    zones: (seat.zones || []).map(z => ({ name: z.name, groupIds: [] })),
    capacities: [],
  };
}

// seed: 시작 회전값. 같은 seed면 같은 결과(결정적). 매 실행마다 다른 seed를 주면
// 첫 세션부터 다르게 섞이고(자연순서 1→N 고정 방지), 재실행 시 다른(여전히 공정한) 배치가 나온다.
export function computeFairAssignment(groups: Group[], meals: IguardMeal[], seatings: IguardSeating[], seed = 0): FairResult {
  const ids = groups.map(g => g.id);
  const N = ids.length;
  const idIndex = new Map(ids.map((id, i) => [id, i]));
  const score = new Map<string, number>(ids.map(id => [id, 0]));
  const mealFront = new Map<string, number>(ids.map(id => [id, 0]));
  const mealMid = new Map<string, number>(ids.map(id => [id, 0]));
  const mealBack = new Map<string, number>(ids.map(id => [id, 0]));
  const rankSum = new Map<string, number>(ids.map(id => [id, 0]));
  const mealCount = new Map<string, number>(ids.map(id => [id, 0]));
  const seatFront = new Map<string, number>(ids.map(id => [id, 0]));

  type Item = { kind: "meal" | "seat"; day: number; ord: number; ref: IguardMeal | IguardSeating };
  const items: Item[] = [
    ...meals.map(m => ({ kind: "meal" as const, day: m.day, ord: m.slot, ref: m })),
    ...seatings.map(s => ({ kind: "seat" as const, day: s.day, ord: s.order, ref: s })),
  ].sort((a, b) => a.day - b.day || a.ord - b.ord || (a.kind === b.kind ? 0 : a.kind === "meal" ? -1 : 1));

  const mealsOut: FairResult["meals"] = [];
  const seatingsOut: FairResult["seatings"] = [];

  items.forEach((item, si) => {
    // 손해 본 조(점수 낮음) 우선. 동점은 세션마다 회전시켜 공정.
    const ordered = [...groups].sort((a, b) => {
      const d = score.get(a.id)! - score.get(b.id)!;
      if (Math.abs(d) > 1e-9) return d;
      const ra = (idIndex.get(a.id)! + si + seed) % N;
      const rb = (idIndex.get(b.id)! + si + seed) % N;
      return ra - rb;
    });

    if (item.kind === "meal") {
      const meal = item.ref as IguardMeal;
      const mealWeight = meal.weight && meal.weight > 0 ? meal.weight : 1;
      const finalOrder = applyPinnedFront(ordered, parsePinnedFront(meal.pinnedFront, groups));
      const prevRound = new Map((meal.entries || []).map(e => [e.groupId, e.round]));
      const entries: IguardMealEntry[] = finalOrder.map((g, i) => {
        const r = prevRound.get(g.id);
        return { groupId: g.id, seq: i, ...(r ? { round: r } : {}) };
      });
      mealsOut.push({ id: meal.id, entries });
      const t1 = N / 3, t2 = (2 * N) / 3; // 앞/중간/뒤 3구간 경계
      finalOrder.forEach((g, i) => {
        score.set(g.id, score.get(g.id)! + (N > 1 ? (N - 1 - i) / (N - 1) : 1) * mealWeight); // 앞=1, 뒤=0
        if (i < t1) mealFront.set(g.id, mealFront.get(g.id)! + 1);
        else if (i < t2) mealMid.set(g.id, mealMid.get(g.id)! + 1);
        else mealBack.set(g.id, mealBack.get(g.id)! + 1);
        rankSum.set(g.id, rankSum.get(g.id)! + (i + 1));
        mealCount.set(g.id, mealCount.get(g.id)! + 1);
      });
    } else {
      const seat = item.ref as IguardSeating;
      const { zones, capacities } = seatingZonesFor(seat, groups);
      const Z = zones.length;
      if (Z === 0) return; // 구역이 없으면 배정 불가 — 건너뜀
      const weights = zones.map((_, z) => {
        const custom = seat.zoneWeights?.[z];
        return typeof custom === "number" && Number.isFinite(custom)
          ? custom
          : Z > 1 ? (Z - 1 - z) / (Z - 1) : 1;
      });
      const newZones: IguardSeatingZone[] = zones.map(z => ({ name: z.name, groupIds: [] }));
      const finalOrder = applyPinnedFront(ordered, parsePinnedFront(seat.pinnedFront, groups));
      let targetZone = 0;
      finalOrder.forEach((g, idx) => {
        let z: number;
        if (capacities.length > 0) {
          while (targetZone < Z - 1 && newZones[targetZone].groupIds.length >= (capacities[targetZone] || 0)) targetZone++;
          z = targetZone;
        } else {
          z = Math.min(Z - 1, Math.floor((idx * Z) / N)); // 0=앞 → Z-1=뒤, 균등 분배
        }
        newZones[z].groupIds.push(g.id);
        score.set(g.id, score.get(g.id)! + weights[z]);
        if (z === 0) seatFront.set(g.id, seatFront.get(g.id)! + 1);
      });
      seatingsOut.push({ id: seat.id, zones: separateAvoidPairs(newZones, parseAvoidPairs(seat.avoidPairs, groups)) });
    }
  });

  const summary = groups.map(g => {
    const mc = mealCount.get(g.id)!;
    return {
      groupId: g.id,
      mealFront: mealFront.get(g.id)!,
      mealMid: mealMid.get(g.id)!,
      mealBack: mealBack.get(g.id)!,
      avgMealRank: mc > 0 ? Math.round((rankSum.get(g.id)! / mc) * 10) / 10 : 0,
      seatFront: seatFront.get(g.id)!,
      score: Math.round((score.get(g.id)! + Number.EPSILON) * 100) / 100,
    };
  });

  return { meals: mealsOut, seatings: seatingsOut, summary, counts: { meals: mealsOut.length, seatings: seatingsOut.length } };
}
