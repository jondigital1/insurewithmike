-- Drop sets as data rather than convention: a flagged row continuing the set
-- above it. Named dropset because drop is a word SQL keeps for itself.

alter table public.sets add column if not exists dropset boolean not null default false;

-- save_workout, third edition: superset tags and the drop flag both carried.
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
      insert into public.sets (id, user_id, exercise_id, position, w, r, rpe, t, d, raw, dropset)
      values (
        (st ->> 'id')::uuid, uid, ex_id, st_pos,
        (st ->> 'w')::numeric, (st ->> 'r')::int, (st ->> 'rpe')::numeric,
        (st ->> 't')::int, (st ->> 'd')::numeric, st ->> 'raw',
        coalesce((st ->> 'drop')::boolean, false)
      );
      st_pos := st_pos + 1;
    end loop;

    ex_pos := ex_pos + 1;
  end loop;
end;
$$;

grant execute on function public.save_workout(jsonb) to authenticated;
