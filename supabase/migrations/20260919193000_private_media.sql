-- Private take/job files. Object key must start with auth.uid().

insert into storage.buckets (id, name, public, file_size_limit)
values ('vocal-private', 'vocal-private', false, 104857600)
on conflict (id) do update set public = false;

create policy vocal_private_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'vocal-private'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy vocal_private_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'vocal-private'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy vocal_private_update_own
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'vocal-private'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'vocal-private'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy vocal_private_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'vocal-private'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
