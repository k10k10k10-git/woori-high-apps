-- 고등부 앱 파일 저장소(Supabase Storage) 버킷·정책 — Firebase Storage 자리.
-- 적용은 통합 담당이 한다(스테이징 → 운영). 이 파일은 실행 기록이 아니라 적용할 원문이다.
--
-- 전제
--   * 0068_rtdb_store.sql 이 먼저 적용돼 있다(rtdb.nodes, api.rtdb_whoami).
--   * 앱은 버킷 `highschool` 에 Firebase 때와 같은 경로를 쓴다. 다만 Supabase 는 한글 키를 받지 않아
--     객체 키는 highschool-app/src/lib/storageUrl.ts 의 storageObjectKey() 로 적는다
--     ([A-Za-z0-9/_.-] 밖의 글자는 UTF-8 바이트마다 `!XX`). 폴더(앞 조각)는 ASCII 그대로라 아래 정책이 읽는다.
--     Firebase Storage 파일을 옮길 때도 같은 함수로 키를 만든다.
--   * 원래 Firebase Storage 규칙 파일은 저장소에 없다(콘솔 관리). 아래 정책은 각 파일이 딸린
--     RTDB 노드의 규칙(attendance-app/database.rules.json)과 같은 사람에게 같은 일을 허용한다:
--       site-requests/{uid}/...                       → iguardPending/$uid : 본인 읽기·쓰기, 통합관리자 읽기·쓰기
--       retreats/{id}/iguard/lodging-maps/...         → retreats .read / retreats/$id/iguard .write
--       semesters/{sid}/archive/...                   → semesters .read / semesters/$sid .write
--   * 규칙의 auth.uid 는 api.rtdb_whoami().uid (uid_map 의 옛 Firebase UID 또는 Supabase id).
--   * 다운로드 주소는 앱이 10년짜리 서명 주소(createSignedUrl)로 만든다. 버킷은 공개하지 않는다.

begin;

-- 1. 버킷 (비공개, 파일 하나 30MB — 앱의 숙소 PDF·자료실 상한과 같다)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('highschool', 'highschool', false, 31457280, null)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- 2. 도우미 함수. 경로를 인자로 받는 읽기 함수는 내부용(실행 권한 없음)으로만 두고,
--    정책에는 "지금 로그인한 사람"만 판정하는 함수를 쓴다(임의 경로 값을 엿볼 수 없게).
create schema if not exists hs_storage;
revoke all on schema hs_storage from public;
grant usage on schema hs_storage to authenticated;

create or replace function hs_storage._leaf(p_path text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select n.value from rtdb.nodes n where n.path = p_path
$$;

-- Firebase exists() / val() != null : 그 위치나 그 아래에 잎이 하나라도 있는가
create or replace function hs_storage._has(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from rtdb.nodes n
    where n.path = p_path or (n.path >= p_path || '/' and n.path < p_path || '0')
  )
$$;

create or replace function hs_storage.rules_uid() returns text
language sql stable security invoker set search_path = '' as $$
  -- 경로 조각으로 쓸 수 없는 값이면 아무 권한도 주지 않는다.
  select w.uid from api.rtdb_whoami() w
  where w.uid ~ '^[A-Za-z0-9_-]{1,128}$'
  limit 1
$$;

-- root.child('admins').child(auth.uid).val() === true
create or replace function hs_storage.is_main_admin() returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_uid text := hs_storage.rules_uid();
begin
  if v_uid is null then return false; end if;
  return coalesce(hs_storage._leaf('admins/' || v_uid) = 'true'::jsonb, false);
end $$;

-- retreats·semesters 의 .read : 통합관리자 또는 retreatAdmins / iguardMembers 에 있는 사람
create or replace function hs_storage.can_read_ministry() returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_uid text := hs_storage.rules_uid();
begin
  if v_uid is null then return false; end if;
  return hs_storage.is_main_admin()
    or hs_storage._has('retreatAdmins/' || v_uid)
    or hs_storage._has('iguardMembers/' || v_uid);
end $$;

-- semesters/$sid 의 .write (규칙 원문을 그대로 옮김)
create or replace function hs_storage.can_write_semester() returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid text := hs_storage.rules_uid();
  ra text;
  semester_role jsonb;
  legacy_role jsonb;
  has_teams boolean;
begin
  if v_uid is null then return false; end if;
  if hs_storage.is_main_admin() then return true; end if;
  ra := 'retreatAdmins/' || v_uid;
  if not hs_storage._has(ra) then return false; end if;
  semester_role := hs_storage._leaf(ra || '/semesterRole');
  legacy_role := hs_storage._leaf(ra || '/role');
  has_teams := hs_storage._has(ra || '/teamMemberships');
  if semester_role in ('"superAdmin"', '"pastor"', '"adminTeam"') then return true; end if;
  if semester_role = '"leader"' and not has_teams then return true; end if;
  if not hs_storage._has(ra || '/semesterRole') then
    if not hs_storage._has(ra || '/role') then return true; end if;
    if legacy_role in ('"superAdmin"', '"pastor"', '"adminTeam"') then return true; end if;
    if legacy_role = '"leader"' and not has_teams then return true; end if;
  end if;
  return false;
end $$;

-- retreats/$id/iguard 의 .write (규칙 원문을 그대로 옮김)
create or replace function hs_storage.can_write_retreat_iguard() returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid text := hs_storage.rules_uid();
  ra text;
  im text;
  ra_retreat jsonb;
  ra_role jsonb;
  im_retreat jsonb;
begin
  if v_uid is null then return false; end if;
  if hs_storage.is_main_admin() then return true; end if;
  ra := 'retreatAdmins/' || v_uid;
  im := 'iguardMembers/' || v_uid;
  if hs_storage._has(ra) then
    ra_retreat := hs_storage._leaf(ra || '/retreatRole');
    ra_role := hs_storage._leaf(ra || '/role');
    if ra_retreat in ('"pastor"', '"adminTeam"', '"leader"', '"iguardTeam"') then return true; end if;
    if not hs_storage._has(ra || '/retreatRole') then
      if not hs_storage._has(ra || '/role') then return true; end if;
      if ra_role in ('"pastor"', '"adminTeam"', '"leader"') then return true; end if;
    end if;
  end if;
  if hs_storage._has(im) then
    im_retreat := hs_storage._leaf(im || '/retreatRole');
    if im_retreat in ('"iguardTeam"', '"leader"') then return true; end if;
    if not hs_storage._has(im || '/retreatRole')
       and hs_storage._leaf('iguardRoles/' || v_uid) is distinct from '"staff"'::jsonb then return true; end if;
  end if;
  return false;
end $$;

revoke all on all functions in schema hs_storage from public, anon, authenticated;
grant execute on function hs_storage.rules_uid(), hs_storage.is_main_admin(), hs_storage.can_read_ministry(),
  hs_storage.can_write_semester(), hs_storage.can_write_retreat_iguard() to authenticated;

-- 3. 정책. 덮어쓰기 업로드(x-upsert)는 insert·update·select 가 모두 필요하다.
drop policy if exists "highschool site-requests select" on storage.objects;
drop policy if exists "highschool site-requests insert" on storage.objects;
drop policy if exists "highschool site-requests update" on storage.objects;
drop policy if exists "highschool site-requests delete" on storage.objects;
drop policy if exists "highschool lodging-maps select" on storage.objects;
drop policy if exists "highschool lodging-maps insert" on storage.objects;
drop policy if exists "highschool lodging-maps update" on storage.objects;
drop policy if exists "highschool lodging-maps delete" on storage.objects;
drop policy if exists "highschool archive select" on storage.objects;
drop policy if exists "highschool archive insert" on storage.objects;
drop policy if exists "highschool archive update" on storage.objects;
drop policy if exists "highschool archive delete" on storage.objects;

-- site-requests/{uid}/{requestId}/attachment.jpg : 본인 또는 통합관리자
create policy "highschool site-requests select" on storage.objects for select to authenticated
  using (bucket_id = 'highschool' and (storage.foldername(name))[1] = 'site-requests'
    and ((storage.foldername(name))[2] = (select hs_storage.rules_uid()) or (select hs_storage.is_main_admin())));
create policy "highschool site-requests insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'highschool' and (storage.foldername(name))[1] = 'site-requests'
    and lower(storage.extension(name)) = 'jpg'
    and ((storage.foldername(name))[2] = (select hs_storage.rules_uid()) or (select hs_storage.is_main_admin())));
create policy "highschool site-requests update" on storage.objects for update to authenticated
  using (bucket_id = 'highschool' and (storage.foldername(name))[1] = 'site-requests'
    and ((storage.foldername(name))[2] = (select hs_storage.rules_uid()) or (select hs_storage.is_main_admin())))
  with check (bucket_id = 'highschool' and (storage.foldername(name))[1] = 'site-requests'
    and lower(storage.extension(name)) = 'jpg'
    and ((storage.foldername(name))[2] = (select hs_storage.rules_uid()) or (select hs_storage.is_main_admin())));
create policy "highschool site-requests delete" on storage.objects for delete to authenticated
  using (bucket_id = 'highschool' and (storage.foldername(name))[1] = 'site-requests'
    and ((storage.foldername(name))[2] = (select hs_storage.rules_uid()) or (select hs_storage.is_main_admin())));

-- retreats/{retreatId}/iguard/lodging-maps/{mapId}/{file}.pdf : 사역 구성원 읽기, 현장 쓰기 권한자 쓰기
create policy "highschool lodging-maps select" on storage.objects for select to authenticated
  using (bucket_id = 'highschool' and (storage.foldername(name))[1] = 'retreats'
    and (storage.foldername(name))[3] = 'iguard' and (storage.foldername(name))[4] = 'lodging-maps'
    and (select hs_storage.can_read_ministry()));
create policy "highschool lodging-maps insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'highschool' and (storage.foldername(name))[1] = 'retreats'
    and (storage.foldername(name))[3] = 'iguard' and (storage.foldername(name))[4] = 'lodging-maps'
    and (select hs_storage.can_write_retreat_iguard()));
create policy "highschool lodging-maps update" on storage.objects for update to authenticated
  using (bucket_id = 'highschool' and (storage.foldername(name))[1] = 'retreats'
    and (storage.foldername(name))[3] = 'iguard' and (storage.foldername(name))[4] = 'lodging-maps'
    and (select hs_storage.can_write_retreat_iguard()))
  with check (bucket_id = 'highschool' and (storage.foldername(name))[1] = 'retreats'
    and (storage.foldername(name))[3] = 'iguard' and (storage.foldername(name))[4] = 'lodging-maps'
    and (select hs_storage.can_write_retreat_iguard()));
create policy "highschool lodging-maps delete" on storage.objects for delete to authenticated
  using (bucket_id = 'highschool' and (storage.foldername(name))[1] = 'retreats'
    and (storage.foldername(name))[3] = 'iguard' and (storage.foldername(name))[4] = 'lodging-maps'
    and (select hs_storage.can_write_retreat_iguard()));

-- semesters/{semesterId}/archive/{fileId}/{file} : 사역 구성원 읽기, 학기 쓰기 권한자 쓰기
create policy "highschool archive select" on storage.objects for select to authenticated
  using (bucket_id = 'highschool' and (storage.foldername(name))[1] = 'semesters'
    and (storage.foldername(name))[3] = 'archive'
    and (select hs_storage.can_read_ministry()));
create policy "highschool archive insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'highschool' and (storage.foldername(name))[1] = 'semesters'
    and (storage.foldername(name))[3] = 'archive'
    and (select hs_storage.can_write_semester()));
create policy "highschool archive update" on storage.objects for update to authenticated
  using (bucket_id = 'highschool' and (storage.foldername(name))[1] = 'semesters'
    and (storage.foldername(name))[3] = 'archive'
    and (select hs_storage.can_write_semester()))
  with check (bucket_id = 'highschool' and (storage.foldername(name))[1] = 'semesters'
    and (storage.foldername(name))[3] = 'archive'
    and (select hs_storage.can_write_semester()));
create policy "highschool archive delete" on storage.objects for delete to authenticated
  using (bucket_id = 'highschool' and (storage.foldername(name))[1] = 'semesters'
    and (storage.foldername(name))[3] = 'archive'
    and (select hs_storage.can_write_semester()));

commit;

-- 적용 뒤 확인(읽기 전용): 정책 12개와 버킷 설정
--   select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'highschool %' order by 1;
--   select id, public, file_size_limit from storage.buckets where id = 'highschool';
