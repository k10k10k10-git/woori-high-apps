import { IguardMeal, IguardMovement, IguardPost, IguardScheduleBlock, IguardSeating, IguardSegment } from "./types";

export const STRUCTURE_CLONE_NODES = [
  "schedule",
  "segments",
  "posts",
  "movements",
  "seating",
  "meals",
  "guide",
] as const;

type CloneNode = typeof STRUCTURE_CLONE_NODES[number];
type RawRecord<T> = Record<string, Omit<T, "id">>;

export type IguardStructureSource = {
  schedule?: RawRecord<IguardScheduleBlock>;
  segments?: RawRecord<IguardSegment>;
  posts?: RawRecord<IguardPost>;
  movements?: RawRecord<IguardMovement>;
  seating?: RawRecord<IguardSeating>;
  meals?: RawRecord<IguardMeal>;
  guide?: string[];
};

export type CloneIdFactory = (node: Exclude<CloneNode, "guide">, sourceId: string) => string;

export function occupiedCloneNodes(value: unknown): CloneNode[] {
  if (!value || typeof value !== "object") return [];
  const raw = value as Record<string, unknown>;
  return STRUCTURE_CLONE_NODES.filter(node => {
    const item = raw[node];
    if (Array.isArray(item)) return item.length > 0;
    return !!item && typeof item === "object" && Object.keys(item as object).length > 0;
  });
}

export function buildStructureClonePayload(
  source: IguardStructureSource,
  makeId: CloneIdFactory,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const blockIds = new Map<string, string>();
  const segmentIds = new Map<string, string>();
  const postIds = new Map<string, string>();

  Object.entries(source.schedule || {}).forEach(([oldId, block]) => {
    const id = makeId("schedule", oldId);
    blockIds.set(oldId, id);
    payload[`schedule/${id}`] = {
      day: block.day,
      start: block.start,
      ...(block.end ? { end: block.end } : {}),
      label: block.label,
      ...(block.detail ? { detail: block.detail } : {}),
      ...(block.meal ? { meal: true } : {}),
      ...(block.noMovement ? { noMovement: true } : {}),
      source: "cloned",
    };
  });

  Object.entries(source.segments || {}).forEach(([oldId, segment]) => {
    const blockId = blockIds.get(segment.blockId);
    if (!blockId) return;
    const id = makeId("segments", oldId);
    segmentIds.set(oldId, id);
    payload[`segments/${id}`] = {
      blockId,
      order: segment.order,
      label: segment.label,
      ...(segment.zone ? { zone: segment.zone } : {}),
      source: "cloned",
    };
  });

  Object.entries(source.posts || {}).forEach(([oldId, post]) => {
    const id = makeId("posts", oldId);
    postIds.set(oldId, id);
    payload[`posts/${id}`] = {
      name: post.name,
      ...(post.area ? { area: post.area } : {}),
      source: "cloned",
    };
  });

  const nextSlot = new Map<string, number>();
  Object.values(source.movements || {}).forEach(movement => {
    if (!movement.segmentId) return;
    const segmentId = segmentIds.get(movement.segmentId);
    const postId = postIds.get(movement.postId);
    const blockId = blockIds.get(movement.blockId);
    if (!segmentId || !postId || !blockId) return;
    const base = `${segmentId}__${postId}`;
    const actor = movement.actor?.trim() || null;
    const slot = (nextSlot.get(base) || 0) + 1;
    nextSlot.set(base, slot);
    const assignee = actor ? `actor${slot}` : `tbd${slot}`;
    payload[`movements/${base}__${assignee}`] = {
      segmentId,
      blockId,
      postId,
      staffId: null,
      slot,
      ...(actor ? { actor } : {}),
      ...(movement.round ? { round: movement.round } : {}),
      ...(movement.detail ? { detail: movement.detail } : {}),
      source: "cloned",
    };
  });

  Object.entries(source.seating || {}).forEach(([oldId, seating]) => {
    const id = makeId("seating", oldId);
    payload[`seating/${id}`] = {
      label: seating.label,
      day: seating.day,
      order: seating.order,
      ...(seating.avoidPairs ? { avoidPairs: seating.avoidPairs } : {}),
      ...(seating.layoutPattern ? { layoutPattern: seating.layoutPattern } : {}),
      ...(seating.zoneWeights ? { zoneWeights: seating.zoneWeights } : {}),
      zones: (seating.zones || []).map(zone => ({ name: zone.name, groupIds: [] })),
      source: "cloned",
    };
  });

  Object.entries(source.meals || {}).forEach(([oldId, meal]) => {
    const id = makeId("meals", oldId);
    payload[`meals/${id}`] = {
      label: meal.label,
      day: meal.day,
      slot: meal.slot,
      entries: [],
      source: "cloned",
    };
  });

  if (Array.isArray(source.guide) && source.guide.length > 0) {
    payload.guide = source.guide.filter(item => typeof item === "string");
  }
  return payload;
}
