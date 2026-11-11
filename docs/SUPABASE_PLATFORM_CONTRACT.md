# 고등부 앱 Firebase → Supabase 플랫폼 이관 — 작업 약속(계약)

- 사용자 지시(2026-11-12): "기존 firebase 처럼 supabase로 플랫폼만 바꿨다고 생각하고 다 옮겨줘" — 다음 수련회 전에 `highschool-app`(woorihigh-app.vercel.app)을 Supabase 위에서 그대로 돌린다.
- 원칙: **데이터 경로·모양·권한 규칙은 그대로.** 화면·업무 코드는 거의 건드리지 않고, Firebase SDK 자리에 같은 이름의 Supabase 기반 모듈을 끼운다.
- Supabase 운영 `iqfgekpubbgjcsvsyyno`, 스테이징 `mpddehdatmnhomsxugcl`(주일학교 플랫폼과 같은 프로젝트). 마이그레이션은 `wooriteens-web/supabase/migrations/0068_rtdb_store.sql`.

## 1. DB: 트리 저장소 (`rtdb` 스키마, 0068)

- `rtdb.nodes(path text collate "C" primary key, value jsonb not null)` — **잎(원시값)만** 저장한다. 경로는 `/` 로 이은 Firebase 키(앞뒤 `/` 없음). 배열은 인덱스 키(`"0"`, `"1"`…)로 펼친다. 하위 트리 조회는 `path = p or (path >= p || '/' and path < p || '0')`.
- `rtdb.uid_map(email text primary key, legacy_uid text unique not null)` — Firebase 계정 이메일 → 옛 UID. 규칙의 `auth.uid` 는 이 표에 이메일이 있으면 옛 UID, 없으면 Supabase `auth.uid()::text`.
- `rtdb.changes(id bigint identity, at timestamptz, paths text[])` — 쓰기마다 한 줄. Supabase Realtime 으로 클라이언트에 "바뀐 경로"만 알린다(값은 싣지 않음). 하루 지난 줄은 쓰기 때 지운다.
- 앱 역할은 표에 직접 접근하지 못한다. 아래 api 함수만.

| 함수 (schema `api`) | 권한 | 뜻 |
|---|---|---|
| `rtdb_whoami()` → `table(uid text, email text, name text)` | authenticated | 규칙에서 쓰는 `auth.uid`·`auth.token.email`·`auth.token.name` |
| `rtdb_get(p_path text)` → `jsonb` | authenticated | 규칙(.read)을 통과하면 그 위치의 값(객체는 키→값, 배열 변환은 클라이언트가). 없으면 `null`. 거부는 SQLSTATE `42501`, 메시지 `permission_denied` |
| `rtdb_get_many(p_paths text[])` → `jsonb` | authenticated | `{ "<path>": 값 }`, 거부된 경로는 `{ "<path>": {"__denied": true} }` (한 번에 여러 구독 새로고침) |
| `rtdb_get_hashed(p_path text)` → `jsonb` | authenticated | `{ "value": 값, "hash": "<md5>" }` (트랜잭션용) |
| `rtdb_update(p_patch jsonb)` → `jsonb` | authenticated | Firebase `update(root, patch)` 와 같다. 키는 루트 기준 경로, 값 `null` 은 지우기. 값 안의 `{".sv":"timestamp"}`·`{".sv":{"increment":n}}` 은 서버가 바꾼다. 규칙 `.write`(위에서 아래로 상속)·`.validate`(새 값의 모든 노드와 바뀐 위치의 조상)를 Firebase 와 같은 뜻으로 검사. 거부 `42501 permission_denied:<path>`, 검증 실패 `23514 validation_failed:<path>`. 반환 `{ "ok": true, "change": <id> }` |
| `rtdb_cas(p_path text, p_expected text, p_value jsonb)` → `jsonb` | authenticated | 트랜잭션 한 번: 지금 hash 가 `p_expected` 면 `update({p_path: p_value})` 와 같은 검사로 쓰고 `{ "committed": true, "value": 새 값, "hash": … }`, 다르면 `{ "committed": false, "value": 지금 값, "hash": … }` |
| `rtdb_admin_get / rtdb_admin_update / rtdb_admin_cas` (같은 인자) | **service_role 만** | Firebase Admin SDK 처럼 규칙 없이 읽고 쓴다(찬양팀 서버) |

- **규칙:** `attendance-app/database.rules.json`(고등부 저장소, 지금 운영 Firebase 와 같은 파일)을 **자동 변환**해 SQL 로 만든다(변환기와 생성 결과를 함께 저장소에 둔다). `root`·`data` 는 쓰기 전 값, `newData` 는 쓰기 후 값. `auth != null` 은 로그인 여부, `auth.token.email` 은 Supabase 로그인 이메일(소문자), `now` 는 서버 시각(ms). `.replace(a,b)` 는 Firebase 처럼 **모두** 바꾼다. 원본 규칙에 없는 최상위 노드(예: `praiseOps`)는 Firebase 처럼 거부(관리자 함수만).
- **비상 정지(0056):** 새 api 함수는 `core.emergency_stop_policy` 에 분류한다(`rtdb_whoami` = keep/identity, 읽기 = stop/sensitive_read, 쓰기 = stop/registry_write, admin_* = stop/registry_write).

## 2. 앱: Firebase SDK 자리 바꾸기 (`highschool-app`)

| 지금 | 바꾼 뒤 | 맡은 사람 |
|---|---|---|
| `firebase/database` | `@/lib/rtdb` — 같은 이름: `getDatabase, ref, child, get, onValue, onChildAdded/Changed/Removed, query, orderByChild, equalTo, limitToFirst, limitToLast, startAt, endAt, endBefore, push, update, set, remove, runTransaction, serverTimestamp`, 타입 `DataSnapshot, DatabaseReference, Unsubscribe, TransactionResult`. `.info/connected` 지원 | 데이터 계층 |
| `firebase/auth` | `@/lib/supabaseAuth` — `auth.currentUser`(`uid`=옛 UID, `email`, `displayName`, `getIdToken()`, `getIdTokenResult()` → `{claims:{name,email}}`), `onAuthStateChanged`, `signOut` | 로그인 |
| `firebase/storage` | `@/lib/supabaseStorage` — `ref, uploadBytesResumable, uploadString, getDownloadURL, deleteObject` (버킷 `highschool`, 경로 그대로) | 로그인 |
| `firebase-admin` (찬양팀 서버) | `@supabase/supabase-js` + `SUPABASE_SERVICE_ROLE_KEY`(서버 환경 변수, 사용자가 넣음) + `rtdb_admin_*` | 로그인 |
| `src/lib/firebase.ts` | 같은 이름(`db`, `auth`, `storage`)을 새 모듈에서 내보낸다 | 로그인 |

- **Supabase 클라이언트:** `@supabase/supabase-js` 2.118.0, 공개 환경 변수 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. 한 곳(`src/lib/supabase.ts`)에서만 만든다. RPC 는 `supabase.schema('api').rpc(...)`.
- **데이터 계층이 지킬 Firebase 동작:**
  - 스냅샷 `val()` 은 Firebase 처럼 숫자 키 객체를 배열로 바꾼다(키가 모두 0 이상 정수이고 `max+1` 의 절반 넘게 채워졌을 때). `forEach`·`val()` 키 순서는 Firebase 순서(정수 키 오름차순 → 문자열 사전순).
  - 쓰기는 **즉시 화면에 반영**(로컬 덮어쓰기)하고 서버 응답을 기다린다. 네트워크가 끊기면 쓰기를 메모리에 쌓아 두고 다시 연결되면 순서대로 보낸다(약속은 그때 끝난다). 거부·검증 실패면 로컬 반영을 되돌리고 약속을 오류로 끝낸다(`error.code = 'PERMISSION_DENIED'`).
  - 구독은 처음에 `rtdb_get`(여러 개면 `rtdb_get_many`)으로 읽고, Realtime `rtdb.changes` INSERT 를 받으면 바뀐 경로와 겹치는(조상·자손) 구독만 다시 읽는다(짧게 묶어서).
  - `push()` 키는 Firebase 푸시 ID 알고리즘(시간 순 20자)을 그대로.
  - `query(...)` 는 받은 값에서 클라이언트가 거른다(`orderByChild`·`equalTo`·`limitTo*`·`startAt`·`endAt`·`endBefore`).
  - `runTransaction` 은 `rtdb_get_hashed` → 콜백 → `rtdb_cas` 를 커밋될 때까지 되풀이(최대 25번).
  - `.info/connected` 는 Realtime 연결 상태.
- **로그인:** 이메일 + 비밀번호, 또는 이메일 6자리 코드(`signInWithOtp`, `shouldCreateUser: true`). Google 로그인 단추는 Supabase 에 Google 로그인이 켜졌을 때만 보인다(환경 변수 `NEXT_PUBLIC_SUPABASE_GOOGLE=1`). `@woorihigh.com` 계정(메일함 없음)은 비밀번호로만 들어온다 — 관리자가 비밀번호를 다시 정해 줄 수 있어야 한다(서버, service role).
- 테스트는 기존 vitest 관례. Firebase 를 흉내 내던 시험은 새 모듈을 흉내 내도록 바꾼다(지우지 않는다).

## 3. 자료 옮기기 (통합 담당)

- Firebase 전체(지금 약 4.1MB, 잎 약 20.5만 개)를 내려받아 잎으로 펼쳐 `rtdb.nodes` 에 넣는다. 옮긴 뒤 노드별 잎 개수·해시를 Firebase 와 대조한다.
- `rtdb.uid_map` 은 Firebase 인증 내보내기(이메일 → UID, 109명)로 채운다.
- 전환 순서: 스테이징에 0068 → 운영 0068 → 자료 넣기 → 앱 배포 → Firebase 를 다시 내려받아 그 사이 바뀐 것이 있는지 대조.
