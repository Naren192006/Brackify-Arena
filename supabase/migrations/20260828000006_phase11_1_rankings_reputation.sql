-- Phase 11.1: automatic rankings, reputation, and achievements.
-- Local migration only; do not push automatically.

alter table public.player_season_rankings add column if not exists previous_rank integer;
alter table public.team_season_rankings add column if not exists previous_rank integer;

create or replace function public.phase11_current_season()
returns uuid language plpgsql security definer set search_path = public as $$
declare season_uuid uuid; season_name text; season_start timestamptz; season_end timestamptz;
begin
  season_start := date_trunc('month', now());
  season_end := season_start + interval '1 month';
  season_name := to_char(season_start, 'FMMonth YYYY');
  insert into public.seasons(name, starts_at, ends_at) values (season_name, season_start, season_end)
    on conflict (name) do update set starts_at = excluded.starts_at, ends_at = excluded.ends_at;
  select id into season_uuid from public.seasons where name = season_name;
  return season_uuid;
end;
$$;

create or replace function public.phase11_award_achievement(target_user uuid, achievement_code text, achievement_name text, achievement_description text)
returns void language plpgsql security definer set search_path = public as $$
declare achievement_uuid uuid;
begin
  insert into public.achievements(code, name, description) values (achievement_code, achievement_name, achievement_description)
    on conflict (code) do update set name = excluded.name, description = excluded.description
    returning id into achievement_uuid;
  insert into public.player_achievements(user_id, achievement_id) values (target_user, achievement_uuid) on conflict do nothing;
end;
$$;

create or replace function public.phase11_award_match_reputation()
returns trigger language plpgsql security definer set search_path = public as $$
declare season_uuid uuid; participant uuid; winner uuid; loser uuid; current_rank integer; wins integer; games integer;
begin
  if new.status::text <> 'completed' or coalesce(old.status::text, '') = 'completed' then return new; end if;
  if new.team_a_id is null or new.team_b_id is null or new.winner_team_id is null then return new; end if;
  season_uuid := public.phase11_current_season();
  winner := new.winner_team_id;
  loser := case when winner = new.team_a_id then new.team_b_id else new.team_a_id end;
  for participant in select tm.user_id from public.team_members tm where tm.team_id in (new.team_a_id, new.team_b_id) loop
    insert into public.player_season_rankings(season_id, user_id, ranking_points, matches_played)
      values (season_uuid, participant, 10, 1)
      on conflict (season_id, user_id) do update set previous_rank = (
        select count(*) + 1 from public.player_season_rankings p where p.season_id = season_uuid and p.ranking_points > public.player_season_rankings.ranking_points
      ), ranking_points = public.player_season_rankings.ranking_points + 10, matches_played = public.player_season_rankings.matches_played + 1;
    if exists (select 1 from public.team_members where team_id = winner and user_id = participant) then
      update public.player_season_rankings set ranking_points = ranking_points + 25, wins = wins + 1 where season_id = season_uuid and user_id = participant;
      update public.profiles set trust_score = least(100, coalesce(trust_score, 50) + 1) where id = participant;
      perform public.phase11_award_achievement(participant, 'first_win', 'First Win', 'Won your first competitive match.');
    else
      update public.profiles set trust_score = greatest(0, coalesce(trust_score, 50) - 1) where id = participant;
    end if;
    select wins, matches_played into wins, games from public.player_season_rankings where season_id = season_uuid and user_id = participant;
    if games = 1 then perform public.phase11_award_achievement(participant, 'first_match', 'First Match', 'Completed your first competitive match.'); end if;
    if wins >= 5 then perform public.phase11_award_achievement(participant, 'five_wins', '5 Wins', 'Won five competitive matches.'); end if;
    if wins = games then perform public.phase11_award_achievement(participant, 'fair_play', 'Fair Play', 'Completed matches without a recorded loss.'); end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists matches_award_reputation on public.matches;
create trigger matches_award_reputation after update of status on public.matches for each row execute function public.phase11_award_match_reputation();

create or replace function public.phase11_award_tournament_reputation()
returns trigger language plpgsql security definer set search_path = public as $$
declare season_uuid uuid; team_id uuid; participant uuid; team_rank integer;
begin
  if new.status::text <> 'completed' or coalesce(old.status::text, '') = 'completed' then return new; end if;
  select b.champion_team_id into team_id from public.brackets b where b.tournament_id = new.id;
  if team_id is null then return new; end if;
  season_uuid := public.phase11_current_season();
  insert into public.team_season_rankings(season_id, team_id, ranking_points, championships)
    values (season_uuid, team_id, 250, 1)
    on conflict (season_id, team_id) do update set previous_rank = (
      select count(*) + 1 from public.team_season_rankings t where t.season_id = season_uuid and t.ranking_points > public.team_season_rankings.ranking_points
    ), ranking_points = public.team_season_rankings.ranking_points + 250, championships = public.team_season_rankings.championships + 1;
  for participant in select tm.user_id from public.team_members tm where tm.team_id = team_id loop
    update public.profiles set trust_score = least(100, coalesce(trust_score, 50) + 1) where id = participant;
    perform public.phase11_award_achievement(participant, 'champion', 'Champion', 'Won a Brackify Arena tournament.');
  end loop;
  return new;
end;
$$;

drop trigger if exists tournaments_award_reputation on public.tournaments;
create trigger tournaments_award_reputation after update of status on public.tournaments for each row execute function public.phase11_award_tournament_reputation();

create or replace function public.phase11_penalize_absence()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.check_in_status::text = 'absent' and coalesce(old.check_in_status::text, '') <> 'absent' then
    update public.profiles p set trust_score = greatest(0, coalesce(p.trust_score, 50) - 5)
      where p.id in (select tm.user_id from public.team_members tm where tm.team_id = new.team_id);
  end if;
  return new;
end;
$$;

drop trigger if exists registrations_penalize_absence on public.tournament_registrations;
create trigger registrations_penalize_absence after update of check_in_status on public.tournament_registrations for each row execute function public.phase11_penalize_absence();
