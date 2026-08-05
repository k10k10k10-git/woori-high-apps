"use client";

import { useEffect, useMemo, useState } from "react";
import {
  subscribeToGroups,
  subscribeToIguardGroupStaff,
  subscribeToIguardMovements,
  subscribeToIguardPosts,
  subscribeToIguardSchedule,
  subscribeToIguardSegments,
  subscribeToTeacherAttendances,
} from "@/features/iguard/lib/db";
import type {
  Group,
  IguardMovement,
  IguardPost,
  IguardScheduleBlock,
  IguardSegment,
  TeacherAttendance,
} from "@/features/iguard/lib/types";
import { buildMyRetreatMinistry } from "./myRetreatMinistry";

const LOAD_KEYS = ["teachers", "groups", "groupStaff", "schedule", "segments", "movements", "posts"] as const;
type LoadKey = (typeof LOAD_KEYS)[number];

interface MinistrySnapshot {
  retreatId: string;
  teachers: TeacherAttendance[];
  groups: Group[];
  groupStaff: Record<string, string[]>;
  schedule: IguardScheduleBlock[];
  segments: IguardSegment[];
  movements: IguardMovement[];
  posts: IguardPost[];
  loaded: Partial<Record<LoadKey, true>>;
  errors: Partial<Record<LoadKey, string>>;
}

function emptySnapshot(retreatId: string): MinistrySnapshot {
  return {
    retreatId,
    teachers: [],
    groups: [],
    groupStaff: {},
    schedule: [],
    segments: [],
    movements: [],
    posts: [],
    loaded: {},
    errors: {},
  };
}

export function useMyRetreatMinistry(
  retreatId: string,
  preferredNames: Array<string | null | undefined>,
) {
  const [snapshot, setSnapshot] = useState<MinistrySnapshot>(() => emptySnapshot(""));
  const preferredNameKey = preferredNames.filter(Boolean).join("\u0000");

  useEffect(() => {
    if (!retreatId) return;

    let alive = true;
    const update = (
      key: LoadKey,
      patch: Partial<MinistrySnapshot>,
      errorMessage?: string,
    ) => {
      if (!alive) return;
      setSnapshot(current => {
        const base = current.retreatId === retreatId ? current : emptySnapshot(retreatId);
        const errors = { ...base.errors };
        if (errorMessage) errors[key] = errorMessage;
        else delete errors[key];
        return {
          ...base,
          ...patch,
          loaded: { ...base.loaded, [key]: true },
          errors,
        };
      });
    };
    const fail = (key: LoadKey) => (cause: Error) => {
      update(key, {}, `${key} 구독 실패 — ${cause.message}`);
    };

    const unsubs = [
      subscribeToTeacherAttendances(retreatId, value => update("teachers", { teachers: value }), fail("teachers")),
      subscribeToGroups(retreatId, value => update("groups", { groups: value }), fail("groups")),
      subscribeToIguardGroupStaff(retreatId, value => update("groupStaff", { groupStaff: value }), fail("groupStaff")),
      subscribeToIguardSchedule(retreatId, value => update("schedule", { schedule: value }), fail("schedule")),
      subscribeToIguardSegments(retreatId, value => update("segments", { segments: value }), fail("segments")),
      subscribeToIguardMovements(retreatId, value => update("movements", { movements: value }), fail("movements")),
      subscribeToIguardPosts(retreatId, value => update("posts", { posts: value }), fail("posts")),
    ];

    return () => {
      alive = false;
      unsubs.forEach(unsubscribe => unsubscribe());
    };
  }, [retreatId]);

  const current = useMemo(
    () => snapshot.retreatId === retreatId ? snapshot : emptySnapshot(retreatId),
    [retreatId, snapshot],
  );
  const ministry = useMemo(() => buildMyRetreatMinistry({
    teachers: current.teachers,
    groups: current.groups,
    groupStaff: current.groupStaff,
    schedule: current.schedule,
    segments: current.segments,
    movements: current.movements,
    posts: current.posts,
    preferredNames: preferredNameKey.split("\u0000").filter(Boolean),
  }), [current, preferredNameKey]);
  const loading = Boolean(retreatId && LOAD_KEYS.some(key => !current.loaded[key]));
  const error = Object.values(current.errors)[0] ?? null;

  return { ...ministry, loading, error };
}
