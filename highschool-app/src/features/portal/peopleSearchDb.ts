import { get, onChildAdded, onChildChanged, onChildRemoved, onValue, ref, type Unsubscribe } from "firebase/database";
import { db } from "@/lib/firebase";
import { paths } from "@/lib/paths";
import { paths as semesterPaths } from "@/features/semester/paths";
import type { PeopleSearchData } from "./peopleSearch";
import { applyRealtimeRecordChild } from "./realtimeRecord";

async function read(path: string): Promise<Record<string, unknown>> {
  const snapshot = await get(ref(db, path));
  return snapshot.exists() ? snapshot.val() as Record<string, unknown> : {};
}

export async function loadPeopleSearchData(options: {
  includeSemester: boolean;
  includePrivate: boolean;
  includeAttendancePrivate: boolean;
}): Promise<PeopleSearchData> {
  const [classes, attendance, retreats, semesters, retreatsPrivate, semestersPrivate, teacherStaff, teacherSpecial, teacherExtra, teacherAdditional] = await Promise.all([
    read(paths.classesRoot()),
    read(paths.attendanceRoot()),
    read(paths.retreats()),
    options.includeSemester ? read(semesterPaths.semesters()) : Promise.resolve({}),
    options.includePrivate ? read(paths.retreatsPrivate()) : Promise.resolve({}),
    options.includePrivate && options.includeSemester
      ? read(semesterPaths.semestersPrivate())
      : Promise.resolve({}),
    read(paths.teacherStaffRoot()),
    read(paths.teacherSpecialRoot()),
    read(paths.teacherExtraRoot()),
    options.includeAttendancePrivate ? read(paths.teacherAdditionalRoot()) : Promise.resolve({}),
  ]);

  return { classes, attendance, retreats, semesters, retreatsPrivate, semestersPrivate, teacherStaff, teacherSpecial, teacherExtra, teacherAdditional };
}

type PeopleSearchSource = keyof PeopleSearchData;

/** 초기 전체값 뒤에는 최상위 child 변경분만 반영해 루트 전체 재다운로드를 피한다. */
function subscribeRecordChildren(
  path: string,
  callback: (value: Record<string, unknown>) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const target = ref(db, path);
  let current: Record<string, unknown> = {};
  let ready = false;
  const emit = () => { if (ready) callback({ ...current }); };
  const upsert = (snapshot: { key: string | null; val: () => unknown }) => {
    if (!snapshot.key) return;
    current = applyRealtimeRecordChild(current, snapshot.key, snapshot.val());
    emit();
  };
  const remove = (snapshot: { key: string | null }) => {
    if (!snapshot.key) return;
    current = applyRealtimeRecordChild(current, snapshot.key, undefined, true);
    emit();
  };
  const unsubs = [
    onChildAdded(target, upsert, onError),
    onChildChanged(target, upsert, onError),
    onChildRemoved(target, remove, onError),
    onValue(target, () => { ready = true; callback({ ...current }); }, onError, { onlyOnce: true }),
  ];
  return () => unsubs.forEach((unsubscribe) => unsubscribe());
}

export function subscribePeopleSearchData(
  options: { includeSemester: boolean; includePrivate: boolean; includeAttendancePrivate: boolean },
  callback: (data: PeopleSearchData) => void,
  onError?: (source: PeopleSearchSource, error: Error) => void,
): Unsubscribe {
  const data: PeopleSearchData = {
    classes: {}, attendance: {}, retreats: {}, semesters: {}, retreatsPrivate: {}, semestersPrivate: {},
    teacherStaff: {}, teacherSpecial: {}, teacherExtra: {}, teacherAdditional: {},
  };
  const ready = new Set<PeopleSearchSource>();
  const sources: PeopleSearchSource[] = [
    "classes", "attendance", "retreats", "semesters", "retreatsPrivate", "semestersPrivate",
    "teacherStaff", "teacherSpecial", "teacherExtra", "teacherAdditional",
  ];
  let emitTimer: ReturnType<typeof setTimeout> | null = null;
  const emit = () => {
    if (ready.size !== sources.length) return;
    if (emitTimer) clearTimeout(emitTimer);
    emitTimer = setTimeout(() => callback({ ...data }), 50);
  };
  const unsubs: Unsubscribe[] = [];
  const attach = (source: PeopleSearchSource, path: string, enabled = true) => {
    if (!enabled) {
      ready.add(source);
      emit();
      return;
    }
    unsubs.push(subscribeRecordChildren(path, (value) => {
      data[source] = value;
      ready.add(source);
      emit();
    }, (error) => onError?.(source, error)));
  };

  attach("classes", paths.classesRoot());
  attach("attendance", paths.attendanceRoot());
  attach("retreats", paths.retreats());
  attach("semesters", semesterPaths.semesters(), options.includeSemester);
  attach("retreatsPrivate", paths.retreatsPrivate(), options.includePrivate);
  attach("semestersPrivate", semesterPaths.semestersPrivate(), options.includePrivate && options.includeSemester);
  attach("teacherStaff", paths.teacherStaffRoot());
  attach("teacherSpecial", paths.teacherSpecialRoot());
  attach("teacherExtra", paths.teacherExtraRoot());
  attach("teacherAdditional", paths.teacherAdditionalRoot(), options.includeAttendancePrivate);

  return () => {
    if (emitTimer) clearTimeout(emitTimer);
    unsubs.forEach((unsubscribe) => unsubscribe());
  };
}
