"use client";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  subscribeToCellColors,
  subscribeToConnection,
  subscribeToGroups,
  subscribeToIguardAttendance,
  subscribeToIguardBuses,
  subscribeToIguardGbs,
  subscribeToIguardGroupStaff,
  subscribeToIguardGuide,
  subscribeToIguardLodgingMaps,
  subscribeToIguardMeals,
  subscribeToIguardMovements,
  subscribeToIguardPosts,
  subscribeToIguardSchedule,
  subscribeToIguardSeating,
  subscribeToIguardSegments,
  subscribeToMilestones,
  subscribeToPartialAttendances,
  subscribeToParticipants,
  subscribeToRetreat,
  subscribeToRetreatPeriods,
  subscribeToRetreatPrograms,
  subscribeToRooms,
  subscribeToRetreatStudents,
  subscribeToTeacherAttendances,
} from "@/features/iguard/lib/db";
import type { Group as AdminGroup, Retreat as AdminRetreat, RetreatProgram } from "@/lib/types";
import {
  Retreat, Group, Room, Student, IguardMeal, IguardScheduleBlock,
  IguardSegment, IguardPost, IguardMovement, AssignedIguardMovement, IguardBus, IguardSeating, Milestone, RetreatPeriod,
  TeacherAttendance, IguardAttendanceInfo, PartialAttendanceMap, Participant,
  IguardGbsPlace,
  IguardLodgingMap,
} from "@/features/iguard/lib/types";
import { useLoadErrors } from "@/lib/useLoadErrors";
import { movementsForDefaultSegments } from "@/features/iguard/lib/defaultSegment";
import { createSubscriptionReadinessGate } from "@/lib/subscriptionReadiness";
import { mergeRetreatWorkspaceSnapshot } from "@/lib/retreatWorkspaceCache";

export interface RetreatData {
  retreat: Retreat | null;
  retreatLoading: boolean;
  dataLoading: boolean;
  loadError: string | null;
  groups: Group[];
  rooms: Room[];
  students: Record<string, Student>;
  participants: Record<string, Participant>;
  adminTeachers: TeacherAttendance[];
  meals: IguardMeal[];
  schedule: IguardScheduleBlock[];
  segments: IguardSegment[];
  posts: IguardPost[];
  /** 구간 UI 전환 전 기존 화면용: 레거시 + 기본 구간의 지정 완료 동선만. */
  movements: AssignedIguardMovement[];
  /** 새 모델 전체 레코드: 비기본 구간·담당 미정 슬롯 포함. */
  movementRecords: IguardMovement[];
  buses: IguardBus[];
  seating: IguardSeating[];
  todos: Milestone[];
  guide: string[];
  periods: RetreatPeriod[];
  attendanceKeys: Set<string>;
  attendanceInfo: Record<string, IguardAttendanceInfo>;
  partial: PartialAttendanceMap;
  cellColors: Record<string, string>;
  groupStaff: Record<string, string[]>;
  gbs: Record<string, IguardGbsPlace>;
  lodgingMaps: IguardLodgingMap[];
  programs: RetreatProgram[];
  connected: boolean;
}

type CachedRetreatData = Omit<RetreatData, "retreatLoading" | "dataLoading" | "loadError"> & {
  loadedScope: string;
  cachedAt: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_KEY = "__wooriIguardRetreatDataCache";

type CacheWindow = Window & {
  [CACHE_KEY]?: Map<string, CachedRetreatData>;
};

function browserRetreatDataCache(): Map<string, CachedRetreatData> | null {
  if (typeof window === "undefined") return null;
  // PC 고정 보기 iframe이 문서를 교체해도 같은 브라우저 탭의 최상위 window는
  // 유지된다. 같은 출처 안에서만 쓰며 서버 전역이나 영구 저장소에는 남기지 않는다.
  const cacheWindow = (window.top ?? window) as CacheWindow;
  cacheWindow[CACHE_KEY] ??= new Map<string, CachedRetreatData>();
  return cacheWindow[CACHE_KEY];
}

function getCachedRetreatData(id: string): CachedRetreatData | null {
  const retreatDataCache = browserRetreatDataCache();
  if (!retreatDataCache) return null;
  const cached = retreatDataCache.get(id);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > CACHE_TTL_MS) {
    retreatDataCache.delete(id);
    return null;
  }
  return cached;
}

/**
 * 수련회 데이터 허브 — 모든 Firebase 실시간 구독을 중앙 관리.
 * IguardClient에서 추출한 22개 실시간 구독 로직.
 */
export function useRetreatData(id: string): RetreatData {
  const [initialCache] = useState(() => getCachedRetreatData(id));
  const [retreat, setRetreat] = useState<Retreat | null>(initialCache?.retreat ?? null);
  const [retreatLoading, setRetreatLoading] = useState(!initialCache);
  const [loadedScope, setLoadedScope] = useState<string | null>(initialCache?.loadedScope ?? null);
  // 22개 구독의 실패를 경로별로 모은다 — 하나로 합치면 첫 실패만 보여 원인을 잘못 짚는다
  // (2026-08-08 학기·홈에서 실제로 두 번 오진했다). scope가 id라 수련회를 옮기면 초기화된다.
  const { fail: failPath, ok: okPath, message: loadError } = useLoadErrors(id);

  const [groups, setGroups] = useState<Group[]>(initialCache?.groups ?? []);
  const [rooms, setRooms] = useState<Room[]>(initialCache?.rooms ?? []);
  const [students, setStudents] = useState<Record<string, Student>>(initialCache?.students ?? {});
  const [participants, setParticipants] = useState<Record<string, Participant>>(initialCache?.participants ?? {});
  const [adminTeachers, setAdminTeachers] = useState<TeacherAttendance[]>(initialCache?.adminTeachers ?? []);
  const [meals, setMeals] = useState<IguardMeal[]>(initialCache?.meals ?? []);
  const [schedule, setSchedule] = useState<IguardScheduleBlock[]>(initialCache?.schedule ?? []);
  const [segments, setSegments] = useState<IguardSegment[]>(initialCache?.segments ?? []);
  const [posts, setPosts] = useState<IguardPost[]>(initialCache?.posts ?? []);
  const [movementRecords, setMovementRecords] = useState<IguardMovement[]>(initialCache?.movementRecords ?? []);
  const [buses, setBuses] = useState<IguardBus[]>(initialCache?.buses ?? []);
  const [seating, setSeating] = useState<IguardSeating[]>(initialCache?.seating ?? []);
  const [todos, setTodos] = useState<Milestone[]>(initialCache?.todos ?? []);
  const [guide, setGuide] = useState<string[]>(initialCache?.guide ?? []);
  const [periods, setPeriods] = useState<RetreatPeriod[]>(initialCache?.periods ?? []);
  const [attendanceKeys, setAttendanceKeys] = useState<Set<string>>(initialCache?.attendanceKeys ?? new Set());
  const [attendanceInfo, setAttendanceInfo] = useState<Record<string, IguardAttendanceInfo>>(initialCache?.attendanceInfo ?? {});
  const [partial, setPartial] = useState<PartialAttendanceMap>(initialCache?.partial ?? {});
  const [cellColors, setCellColors] = useState<Record<string, string>>(initialCache?.cellColors ?? {});
  const [groupStaff, setGroupStaff] = useState<Record<string, string[]>>(initialCache?.groupStaff ?? {});
  const [gbs, setGbs] = useState<Record<string, IguardGbsPlace>>(initialCache?.gbs ?? {});
  const [lodgingMaps, setLodgingMaps] = useState<IguardLodgingMap[]>(initialCache?.lodgingMaps ?? []);
  const [programs, setPrograms] = useState<RetreatProgram[]>(initialCache?.programs ?? []);
  const [connected, setConnected] = useState(initialCache?.connected ?? true);
  const movements = useMemo(
    () => movementsForDefaultSegments(segments, movementRecords),
    [segments, movementRecords],
  );

  // 수련회 메타 구독
  useEffect(() => {
    if (!id) return;
    let alive = true;
    const unsub = subscribeToRetreat(id,
      r => {
        if (!alive) return;
        setRetreat(r);
        mergeRetreatWorkspaceSnapshot(id, { retreat: r as AdminRetreat | null });
        okPath("수련회 정보");
        setRetreatLoading(false);
      },
      e => { if (alive) { failPath("수련회 정보")(e); setRetreatLoading(false); } });
    return () => { alive = false; unsub(); };
  }, [id, failPath, okPath]);

  // 연결 상태 구독 — 수련회와 무관한 앱 전역 상태라 별도 useEffect
  useEffect(() => {
    let alive = true;
    const unsub = subscribeToConnection(
      value => { if (alive) { setConnected(value); okPath("연결 상태"); } },
      error => { if (alive) failPath("연결 상태")(error); },
    );
    return () => { alive = false; unsub(); };
  }, [failPath, okPath]);

  // 데이터 구독은 id·연도에만 의존 — 메타(이름/날짜) 실시간 변경 시 재구독하지 않도록
  const retreatYear = retreat?.id === id ? retreat.year : undefined;
  const dataScope = retreatYear == null ? null : `${id}:${retreatYear}`;
  const dataLoading = dataScope == null || loadedScope !== dataScope;
  useEffect(() => {
    if (!id || retreatYear == null) return;
    const scope = `${id}:${retreatYear}`;
    let alive = true;
    const readiness = createSubscriptionReadinessGate([
      "students", "participants", "adminTeachers", "groups", "rooms", "meals", "schedule", "segments", "posts",
      "movements", "buses", "seating", "todos", "guide", "periods", "attendance", "partial", "cellColors", "groupStaff", "gbs", "lodgingMaps", "programs",
    ], () => { if (alive) setLoadedScope(scope); });
    // 성공하면 그 경로의 이전 실패를 지운다 — 권한이 열린 뒤 재구독하면 배너가 사라진다.
    const ready = (key: string) => {
      if (!alive) return;
      okPath(key);
      readiness.markReady(key);
    };
    const receive = <T,>(setter: Dispatch<SetStateAction<T>>, key: string) => (value: T) => {
      if (!alive) return;
      setter(value);
      ready(key);
    };
    // 구독 에러(권한 거부·규칙 변경 등) 시: 실패한 경로를 배너에 모으고 해당 키를 ready 처리해
    // dataLoading이 영원히 true로 남는 "무한 스피너"를 방지한다.
    const fail = (key: string) => (error: Error) => {
      if (!alive) return;
      failPath(key)(error);
      readiness.markReady(key);
    };
    const unsubs = [
      subscribeToRetreatStudents(id, retreatYear, receive(setStudents, "students"), fail("students")),
      subscribeToParticipants(id, receive(setParticipants, "participants"), fail("participants")),
      subscribeToTeacherAttendances(id, receive(setAdminTeachers, "adminTeachers"), fail("adminTeachers")),
      subscribeToGroups(id, value => {
        if (!alive) return;
        setGroups(value);
        mergeRetreatWorkspaceSnapshot(id, { groups: value as AdminGroup[] });
        ready("groups");
      }, fail("groups")),
      subscribeToRooms(id, receive(setRooms, "rooms"), fail("rooms")),
      subscribeToIguardMeals(id, receive(setMeals, "meals"), fail("meals")),
      subscribeToIguardSchedule(id, receive(setSchedule, "schedule"), fail("schedule")),
      subscribeToIguardSegments(id, receive(setSegments, "segments"), fail("segments")),
      subscribeToIguardPosts(id, receive(setPosts, "posts"), fail("posts")),
      subscribeToIguardMovements(id, receive(setMovementRecords, "movements"), fail("movements")),
      subscribeToIguardBuses(id, receive(setBuses, "buses"), fail("buses")),
      subscribeToIguardSeating(id, receive(setSeating, "seating"), fail("seating")),
      subscribeToMilestones(receive(setTodos, "todos"), fail("todos")),
      subscribeToIguardGuide(id, receive(setGuide, "guide"), fail("guide")),
      subscribeToRetreatPeriods(id, receive(setPeriods, "periods"), fail("periods")),
      subscribeToIguardAttendance(id, (value, info) => {
        if (!alive) return;
        setAttendanceKeys(value); setAttendanceInfo(info); ready("attendance");
      }, fail("attendance")),
      subscribeToPartialAttendances(id, receive(setPartial, "partial"), fail("partial")),
      subscribeToCellColors(id, receive(setCellColors, "cellColors"), fail("cellColors")),
      subscribeToIguardGroupStaff(id, receive(setGroupStaff, "groupStaff"), fail("groupStaff")),
      subscribeToIguardGbs(id, receive(setGbs, "gbs"), fail("gbs")),
      subscribeToIguardLodgingMaps(id, receive(setLodgingMaps, "lodgingMaps"), fail("lodgingMaps")),
      subscribeToRetreatPrograms(id, value => {
        if (!alive) return;
        setPrograms(value);
        mergeRetreatWorkspaceSnapshot(id, { programs: value });
        ready("programs");
      }, fail("programs")),
    ];
    return () => {
      alive = false;
      unsubs.forEach(u => u());
    };
  }, [id, retreatYear, failPath, okPath]);

  // 같은 수련회 안에서 행정·프로그램·이가드를 오갈 때 마지막 정상 화면을 즉시
  // 복원한다. 현재 구독은 계속 다시 연결되어 캐시 뒤에서 최신 값을 덮어쓴다.
  useEffect(() => {
    if (!retreat || retreatLoading || dataLoading || !loadedScope) return;
    const retreatDataCache = browserRetreatDataCache();
    if (!retreatDataCache) return;
    retreatDataCache.set(id, {
      retreat,
      groups,
      rooms,
      students,
      participants,
      adminTeachers,
      meals,
      schedule,
      segments,
      posts,
      movements,
      movementRecords,
      buses,
      seating,
      todos,
      guide,
      periods,
      attendanceKeys,
      attendanceInfo,
      partial,
      cellColors,
      groupStaff,
      gbs,
      lodgingMaps,
      programs,
      connected,
      loadedScope,
      cachedAt: Date.now(),
    });
  }, [
    adminTeachers, attendanceInfo, attendanceKeys, buses, cellColors, connected, dataLoading,
    gbs, groupStaff, groups, guide, id, loadedScope, lodgingMaps, meals, movementRecords,
    movements, participants, partial, periods, posts, programs, retreat, retreatLoading,
    rooms, schedule, seating, segments, students, todos,
  ]);

  return {
    retreat, retreatLoading, dataLoading, loadError,
    groups, rooms, students, participants, adminTeachers,
    meals, schedule, segments, posts, movements, movementRecords, buses, seating,
    todos, guide, periods, attendanceKeys, attendanceInfo, partial, cellColors, groupStaff, gbs, lodgingMaps, programs,
    connected,
  };
}
