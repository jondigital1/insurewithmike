-- Supersets. A tag shared by the exercises that run together, rather than a
-- table of its own: a superset has no properties beyond which movements are in
-- it and the order they sit in, both of which already live on the exercise.

alter table public.exercises add column if not exists superset text;

create index if not exists exercises_superset_idx on public.exercises (workout_id, superset);

-- Same as 0002, carrying the tag through.
create or replace function public.save_workout(payload jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  w_id uuid := (payload ->> 'id')::uuid;
  ex jsonb;
  st jsonb;
  ex_id uuid;
  ex_pos int := 0;
  st_pos int;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.workouts (id, user_id, date, title)
  values (w_id, uid, (payload ->> 'date')::date, payload ->> 'title')
  on conflict (id) do update
    set date = excluded.date,
        title = excluded.title;

  delete from public.exercises where workout_id = w_id;

  for ex in select * from jsonb_array_elements(coalesce(payload -> 'exercises', '[]'::jsonb))
  loop
    ex_id := (ex ->> 'id')::uuid;

    insert into public.exercises (id, user_id, workout_id, name, type, position, superset)
    values (ex_id, uid, w_id, ex ->> 'name', ex ->> 'type', ex_pos, ex ->> 'superset');

    st_pos := 0;
    for st in select * from jsonb_array_elements(coalesce(ex -> 'sets', '[]'::jsonb))
    loop
      insert into public.sets (id, user_id, exercise_id, position, w, r, rpe, t, d, raw)
      values (
        (st ->> 'id')::uuid, uid, ex_id, st_pos,
        (st ->> 'w')::numeric, (st ->> 'r')::int, (st ->> 'rpe')::numeric,
        (st ->> 't')::int, (st ->> 'd')::numeric, st ->> 'raw'
      );
      st_pos := st_pos + 1;
    end loop;

    ex_pos := ex_pos + 1;
  end loop;
end;
$$;

grant execute on function public.save_workout(jsonb) to authenticated;
