// db 객체. Firebase 의 Database 와 모양(type·app)이 같아, 통합 전 `@/lib/firebase` 의 db 를 넘겨도 컴파일된다.
import { getSupabase } from "@/lib/supabase";
import { Repo, type RepoOptions } from "./repo";
import type { SupabaseLike } from "./transport";

export interface Database {
  readonly type: "database";
  readonly app: unknown;
}

export class RtdbDatabase implements Database {
  readonly type = "database" as const;
  readonly app = null;

  constructor(readonly _repo: Repo) {}
}

/** 시험·도구용: 원하는 Supabase 클라이언트로 db 를 만든다. 앱은 getDatabase() 를 쓴다. */
export function createDatabase(options: RepoOptions): RtdbDatabase {
  return new RtdbDatabase(new Repo(options));
}

let defaultDatabase: RtdbDatabase | null = null;

/** 앱 기본 db(Supabase `getSupabase()` 사용). Firebase 처럼 인자(app)는 받되 쓰지 않는다. */
export function getDatabase(_app?: unknown): RtdbDatabase {
  void _app;
  if (!defaultDatabase) {
    defaultDatabase = createDatabase({
      client: () => getSupabase() as unknown as SupabaseLike,
      url: `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/rtdb`,
    });
    // 브라우저에서는 첫 구독 전에 실시간 연결을 미리 열어, 첫 화면 값을 읽은 뒤 다시 읽는 일을 줄인다.
    if (typeof window !== "undefined") {
      const repo = defaultDatabase._repo;
      setTimeout(() => repo.start(), 0);
    }
  }
  return defaultDatabase;
}

/** ref() 에 다른 db(통합 전 Firebase db)가 와도 기본 db 로 잇는다. */
export function repoOf(db: Database): Repo {
  return db instanceof RtdbDatabase ? db._repo : getDatabase()._repo;
}
