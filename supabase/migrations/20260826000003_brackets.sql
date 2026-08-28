do $$ begin
  create type public.match_status as enum ('scheduled', 'live', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.round_type as enum ('quarterfinal', 'semifinal', 'final', 'grand_final');
exception when duplicate_object then null; end $$;

create table if not exists public.brackets (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  format text not null default 'single_elimination' check (format = 'single_elimination'),
  total_rounds integer not null check (total_rounds between 1 and 12),
  champion_team_id uuid references public.teams(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tournament_id)
);

create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  bracket_id uuid not null references public.brackets(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  round_type public.round_type not null,
  created_at timestamptz not null default now(),
  unique (bracket_id, round_number)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  bracket_id uuid not null references public.brackets(id) on delete cascade,
  round_id uuid not null references public.rounds(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  match_number integer not null check (match_number > 0),
  team_a_id uuid references public.teams(id) on delete set null,
  team_b_id uuid references public.teams(id) on delete set null,
  winner_team_id uuid references public.teams(id) on delete set null,
  scheduled_at timestamptz,
  completed_at timestamptz,
  status public.match_status not null default 'scheduled',
  created_at timestamptz not null default now(),
  unique (round_id, match_number),
  check (winner_team_id is null or winner_team_id = team_a_id or winner_team_id = team_b_id),
  check ((status::text = 'completed' and winner_team_id is not null and completed_at is not null) or status::text <> 'completed')
);

create index if not exists brackets_tournament_idx on public.brackets(tournament_id);
create index if not exists rounds_bracket_idx on public.rounds(bracket_id);
create index if not exists matches_tournament_idx on public.matches(tournament_id);
create index if not exists matches_round_idx on public.matches(round_id);
create index if not exists matches_winner_idx on public.matches(winner_team_id);
create index if not exists matches_round_number_idx on public.matches(round_number);

alter table public.brackets enable row level security;
alter table public.rounds enable row level security;
alter table public.matches enable row level security;

drop policy if exists brackets_public_select on public.brackets;
create policy brackets_public_select on public.brackets for select using (true);
drop policy if exists rounds_public_select on public.rounds;
create policy rounds_public_select on public.rounds for select using (true);
drop policy if exists matches_public_select on public.matches;
create policy matches_public_select on public.matches for select using (true);

drop policy if exists brackets_admin_write on public.brackets;
create policy brackets_admin_write on public.brackets for all to authenticated
  using (exists (select 1 from public.tournament_admins a where a.tournament_id = brackets.tournament_id and a.user_id = auth.uid()))
  with check (exists (select 1 from public.tournament_admins a where a.tournament_id = brackets.tournament_id and a.user_id = auth.uid()));
drop policy if exists rounds_admin_write on public.rounds;
create policy rounds_admin_write on public.rounds for all to authenticated
  using (exists (select 1 from public.brackets b join public.tournament_admins a on a.tournament_id = b.tournament_id and a.user_id = auth.uid() where b.id = rounds.bracket_id))
  with check (exists (select 1 from public.brackets b join public.tournament_admins a on a.tournament_id = b.tournament_id and a.user_id = auth.uid() where b.id = rounds.bracket_id));
drop policy if exists matches_admin_write on public.matches;
create policy matches_admin_write on public.matches for all to authenticated
  using (exists (select 1 from public.tournament_admins a where a.tournament_id = matches.tournament_id and a.user_id = auth.uid()))
  with check (exists (select 1 from public.tournament_admins a where a.tournament_id = matches.tournament_id and a.user_id = auth.uid()));

grant select on public.brackets, public.rounds, public.matches to anon, authenticated;

create or replace function public.generate_single_elimination_bracket(tournament_uuid uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  bracket_uuid uuid;
  team_count integer;
  total integer;
  round_no integer;
  round_uuid uuid;
  round_kind text;
  match_no integer;
  shuffled_team uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.tournament_admins where tournament_id = tournament_uuid and user_id = auth.uid()) then raise exception 'tournament_admin_required'; end if;
  if exists (select 1 from public.brackets where tournament_id = tournament_uuid) then raise exception 'bracket_already_exists'; end if;

  select count(*) into team_count from public.tournament_registrations
    where tournament_id = tournament_uuid and status::text = 'checked_in';
  if team_count < 2 or (team_count & (team_count - 1)) <> 0 then raise exception 'checked_in_count_must_be_power_of_two'; end if;
  total := floor(log(2, team_count))::integer;

  insert into public.brackets(tournament_id, total_rounds) values (tournament_uuid, total) returning id into bracket_uuid;
  for round_no in 1..total loop
    round_kind := case
      when round_no = total then 'final'
      when round_no = total - 1 then 'semifinal'
      else 'quarterfinal'
    end;
    insert into public.rounds(bracket_id, round_number, round_type) values (bracket_uuid, round_no, round_kind::public.round_type) returning id into round_uuid;
    for match_no in 1..(team_count / power(2, round_no)::integer) loop
      insert into public.matches(tournament_id, bracket_id, round_id, round_number, match_number)
        values (tournament_uuid, bracket_uuid, round_uuid, round_no, match_no);
    end loop;
  end loop;

  match_no := 0;
  for shuffled_team in select tr.team_id from public.tournament_registrations tr where tr.tournament_id = tournament_uuid and tr.status::text = 'checked_in' order by random() loop
    match_no := match_no + 1;
    update public.matches set team_a_id = case when match_no % 2 = 1 then shuffled_team else team_a_id end,
      team_b_id = case when match_no % 2 = 0 then shuffled_team else team_b_id end
      where bracket_id = bracket_uuid and round_number = 1 and match_number = ((match_no + 1) / 2);
  end loop;
  return bracket_uuid;
end;
$$;

create or replace function public.advance_match_winner(match_uuid uuid, winner_uuid uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare current_match public.matches%rowtype; next_match_id uuid; next_round_id uuid; next_match_no integer; next_round integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into current_match from public.matches where id = match_uuid for update;
  if current_match.id is null then raise exception 'match_not_found'; end if;
  if not exists (select 1 from public.tournament_admins where tournament_id = current_match.tournament_id and user_id = auth.uid()) then raise exception 'tournament_admin_required'; end if;
  if current_match.status::text = 'completed' then raise exception 'match_already_completed'; end if;
  if winner_uuid is null or winner_uuid <> current_match.team_a_id and winner_uuid <> current_match.team_b_id then raise exception 'winner_must_be_a_match_team'; end if;

  update public.matches set winner_team_id = winner_uuid, status = (select enumlabel::public.match_status from pg_enum where enumtypid = 'public.match_status'::regtype and enumlabel = 'completed'), completed_at = now() where id = match_uuid;
  next_round := current_match.round_number + 1;
  select r.id into next_round_id from public.rounds r where r.bracket_id = current_match.bracket_id and r.round_number = next_round;
  if next_round_id is null then
    update public.brackets set champion_team_id = winner_uuid where id = current_match.bracket_id;
    return winner_uuid;
  end if;
  next_match_no := (current_match.match_number + 1) / 2;
  select m.id into next_match_id from public.matches m where m.round_id = next_round_id and m.match_number = next_match_no for update;
  if current_match.match_number % 2 = 1 then
    update public.matches set team_a_id = winner_uuid where id = next_match_id;
  else
    update public.matches set team_b_id = winner_uuid where id = next_match_id;
  end if;
  return winner_uuid;
end;
$$;

create or replace function public.get_tournament_bracket(tournament_uuid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_build_object(
    'id', b.id,
    'tournament_id', b.tournament_id,
    'format', b.format,
    'total_rounds', b.total_rounds,
    'champion_team_id', b.champion_team_id,
    'created_at', b.created_at,
    'rounds', (select jsonb_agg(jsonb_build_object(
      'id', r.id, 'bracket_id', r.bracket_id, 'round_number', r.round_number, 'round_type', r.round_type, 'created_at', r.created_at,
      'matches', (select coalesce(jsonb_agg(to_jsonb(m) order by m.match_number), '[]'::jsonb) from public.matches m where m.round_id = r.id)
    ) order by r.round_number) from public.rounds r where r.bracket_id = b.id)
  ), '{}'::jsonb) from public.brackets b where b.tournament_id = tournament_uuid;
$$;

grant execute on function public.generate_single_elimination_bracket(uuid) to authenticated;
grant execute on function public.advance_match_winner(uuid, uuid) to authenticated;
grant execute on function public.get_tournament_bracket(uuid) to anon, authenticated;
