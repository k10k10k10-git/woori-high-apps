import { SemesterMeta } from "./types";

export interface SettingsDraft {
  sid: string;
  initialized: boolean;
  dirty: boolean;
  title: string;
  minRatePct: number;
}

export function createSettingsDraft(sid: string, meta: SemesterMeta | null): SettingsDraft {
  return {
    sid,
    initialized: meta !== null,
    dirty: false,
    title: meta?.title ?? "",
    minRatePct: Math.round((meta?.completionRule?.minRate ?? 0.7) * 100),
  };
}

export function syncSettingsDraft(
  current: SettingsDraft,
  sid: string,
  meta: SemesterMeta | null,
): SettingsDraft {
  if (current.sid !== sid) return createSettingsDraft(sid, meta);
  if (!meta || current.initialized || current.dirty) return current;
  return createSettingsDraft(sid, meta);
}

export function editSettingsDraft(
  current: SettingsDraft,
  partial: Pick<SettingsDraft, "title"> | Pick<SettingsDraft, "minRatePct">,
): SettingsDraft {
  return { ...current, ...partial, dirty: true };
}
