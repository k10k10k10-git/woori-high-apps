import type { BusStudentGender } from "./types";

export interface BusAssignmentUnit {
  id: string;
  size: number;
  gender?: BusStudentGender;
}

export interface BusAssignmentBin {
  unitIds: string[];
  gender?: BusStudentGender;
}

interface WorkingBin extends BusAssignmentBin {
  count: number;
  capacity: number;
  target: number;
}

interface AssignOptions {
  separateGenders?: boolean;
  reservedSeats?: number;
  attempts?: number;
  random?: () => number;
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** 정원·조각 불변식을 지키는 공통 버스 배정기. 혼합 모드는 기존 점수식을 그대로 사용한다. */
export function assignBusUnits(
  capacities: number[],
  units: BusAssignmentUnit[],
  options: AssignOptions = {},
): BusAssignmentBin[] | null {
  if (capacities.length === 0) return null;
  const separateGenders = options.separateGenders ?? false;
  const reservedSeats = options.reservedSeats ?? 0;
  const attempts = options.attempts ?? 400;
  const random = options.random ?? Math.random;
  const sizeOf = new Map(units.map(unit => [unit.id, unit.size]));
  const genderOf = new Map(units.map(unit => [unit.id, unit.gender]));
  const totalPassengers = units.reduce((sum, unit) => sum + unit.size, 0);
  const sumCapacity = capacities.reduce((sum, capacity) => sum + capacity, 0);
  const targets = capacities.map(capacity => totalPassengers * (capacity / sumCapacity));

  const normalize = (bin: WorkingBin): WorkingBin | null => {
    const genders = new Set(bin.unitIds.map(id => genderOf.get(id)).filter((gender): gender is BusStudentGender => !!gender));
    if (separateGenders && genders.size > 1) return null;
    return {
      ...bin,
      count: bin.unitIds.reduce((sum, id) => sum + (sizeOf.get(id) ?? 0), 0),
      gender: genders.size === 1 ? [...genders][0] : undefined,
    };
  };
  const cloneBins = (bins: WorkingBin[]): WorkingBin[] => bins.map(bin => ({ ...bin, unitIds: [...bin.unitIds] }));
  const score = (bins: WorkingBin[]) => {
    const devs = bins.map(bin => bin.count - bin.target);
    const range = Math.max(...devs) - Math.min(...devs);
    const variance = devs.reduce((sum, deviation) => sum + deviation * deviation, 0);
    const overReserve = bins.reduce((sum, bin) => sum + Math.max(0, bin.count - (bin.capacity - reservedSeats)), 0);
    const emptyCount = bins.filter(bin => bin.count === 0).length;
    return range * 10000 + variance * 100 + overReserve * 80 + emptyCount * 1000 + random();
  };
  const newBins = (): WorkingBin[] => capacities.map((capacity, index) => ({
    unitIds: [], count: 0, capacity, target: targets[index],
  }));

  const makeOrder = () => {
    const ordered = shuffled(units, random).map(unit => ({ ...unit, jitter: random() }));
    const strategy = random();
    if (strategy < 0.4) return ordered;
    if (strategy < 0.75) return ordered.sort((a, b) => (b.size + b.jitter * 10) - (a.size + a.jitter * 10));
    return ordered.sort((a, b) => (a.size + a.jitter * 8) - (b.size + b.jitter * 8));
  };

  const improve = (initial: WorkingBin[]) => {
    let current = cloneBins(initial);
    let currentScore = score(current);

    for (let pass = 0; pass < 80; pass++) {
      let best: { bins: WorkingBin[]; score: number } | null = null;
      for (let from = 0; from < current.length; from++) {
        for (let to = 0; to < current.length; to++) {
          if (from === to) continue;
          for (const unitId of current[from].unitIds) {
            const moved = cloneBins(current);
            moved[from].unitIds = moved[from].unitIds.filter(id => id !== unitId);
            moved[to].unitIds.push(unitId);
            const normalizedFrom = normalize(moved[from]);
            const normalizedTo = normalize(moved[to]);
            if (normalizedFrom && normalizedTo && normalizedFrom.count <= normalizedFrom.capacity && normalizedTo.count <= normalizedTo.capacity) {
              moved[from] = normalizedFrom;
              moved[to] = normalizedTo;
              const nextScore = score(moved);
              if (nextScore < currentScore && (!best || nextScore < best.score)) best = { bins: moved, score: nextScore };
            }

            for (const otherId of current[to].unitIds) {
              const swapped = cloneBins(current);
              swapped[from].unitIds = swapped[from].unitIds.map(id => id === unitId ? otherId : id);
              swapped[to].unitIds = swapped[to].unitIds.map(id => id === otherId ? unitId : id);
              const normalizedSwapFrom = normalize(swapped[from]);
              const normalizedSwapTo = normalize(swapped[to]);
              if (!normalizedSwapFrom || !normalizedSwapTo || normalizedSwapFrom.count > normalizedSwapFrom.capacity || normalizedSwapTo.count > normalizedSwapTo.capacity) continue;
              swapped[from] = normalizedSwapFrom;
              swapped[to] = normalizedSwapTo;
              const nextScore = score(swapped);
              if (nextScore < currentScore && (!best || nextScore < best.score)) best = { bins: swapped, score: nextScore };
            }
          }
        }
      }
      if (!best) break;
      current = best.bins;
      currentScore = best.score;
    }
    return current;
  };

  const pack = (): WorkingBin[] | null => {
    const bins = newBins();
    for (const unit of makeOrder()) {
      const feasible = bins
        .map((bin, index) => {
          const nextCount = bin.count + unit.size;
          const genderAllowed = !separateGenders || !bin.gender || bin.gender === unit.gender;
          return { index, nextCount, remaining: bin.capacity - nextCount, balanceGap: Math.abs(nextCount - bin.target), genderAllowed };
        })
        .filter(candidate => candidate.genderAllowed && candidate.remaining >= 0)
        .sort((a, b) => a.balanceGap - b.balanceGap || a.nextCount - b.nextCount);
      if (feasible.length === 0) return null;
      const candidates = feasible.slice(0, Math.min(feasible.length, 4));
      const chosen = candidates[Math.floor(random() * candidates.length)];
      bins[chosen.index].unitIds.push(unit.id);
      bins[chosen.index].count += unit.size;
      if (separateGenders) bins[chosen.index].gender = unit.gender;
    }
    return improve(bins);
  };

  const packed = Array.from({ length: attempts }, pack).filter((bins): bins is WorkingBin[] => !!bins);
  if (packed.length === 0) return null;
  const ranked = packed.map(bins => ({ bins, score: score(bins) })).sort((a, b) => a.score - b.score);
  const bestScore = ranked[0].score;
  const finalists = ranked.filter(item => item.score <= bestScore + 1000).slice(0, 6);
  const selected = shuffled(finalists, random)[0].bins;
  return selected.map(bin => ({ unitIds: shuffled(bin.unitIds, random), gender: bin.gender }));
}
