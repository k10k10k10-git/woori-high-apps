import { get, onChildAdded, onChildChanged, onChildRemoved, onValue, ref, type Unsubscribe } from "@/lib/rtdb";
import { db } from "@/lib/firebase";
import { paths } from "@/lib/paths";
import { paths as semesterPaths } from "@/features/semester/paths";
import type { PeopleSearchData } from "./peopleSearch";
import { applyRealtimeRecordChild } from "./realtimeRecord";

type PeopleSearchSource = keyof PeopleSearchData;

function emptySearchData(): PeopleSearchData {
  return {
    classes: {}, attendance: {}, retreats: {}, semesters: {}, retreatsPrivate: {}, semestersPrivate: {},
    teacherStaff: {}, teacherSpecial: {}, teacherExtra: {}, teacherAdditional: {},
  };
}

/** 일반 get은 구독 RPC에 묶이지 않아 홈 화면의 큰 조회와 별개로 응답한다. */
export async function readCurrentStudentRoster(): Promise<PeopleSearchData> {
  const year = new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Seoul" }).format(new Date());
  const snapshot = await get(ref(db, semesterPaths.classesByYear(year)));
  return { ...emptySearchData(), classes: { [year]: snapshot.val() ?? {} } };
}

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
  onRosterReady?: (data: PeopleSearchData) => void,
): Unsubscribe {
  const data = emptySearchData();
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
  const attach = (source: PeopleSearchSource, path: string, enabled = true, onReady?: () => void) => {
    if (!enabled) {
      ready.add(source);
      emit();
      return;
    }
    unsubs.push(subscribeRecordChildren(path, (value) => {
      data[source] = value;
      ready.add(source);
      onReady?.();
      emit();
    }, (error) => onError?.(source, error)));
  };

  // RTDB 호환 계층은 같은 시점의 루트 읽기를 한 RPC로 묶는다.
  // 학생 명단의 첫 응답을 받은 뒤 나머지 루트를 열어 이름 검색이 큰 자료에 막히지 않게 한다.
  let detailsStarted = false;
  attach("classes", paths.classesRoot(), true, () => {
    if (detailsStarted) return;
    detailsStarted = true;
    onRosterReady?.({ ...data });
    attach("attendance", paths.attendanceRoot());
    attach("retreats", paths.retreats());
    attach("semesters", semesterPaths.semesters(), options.includeSemester);
    attach("retreatsPrivate", paths.retreatsPrivate(), options.includePrivate);
    attach("semestersPrivate", semesterPaths.semestersPrivate(), options.includePrivate && options.includeSemester);
    attach("teacherStaff", paths.teacherStaffRoot());
    attach("teacherSpecial", paths.teacherSpecialRoot());
    attach("teacherExtra", paths.teacherExtraRoot());
    attach("teacherAdditional", paths.teacherAdditionalRoot(), options.includeAttendancePrivate);
  });

  return () => {
    if (emitTimer) clearTimeout(emitTimer);
    unsubs.forEach((unsubscribe) => unsubscribe());
  };
}
