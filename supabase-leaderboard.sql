-- Bubble Island global leaderboard
-- 1) Enable Anonymous Sign-Ins in Supabase Auth settings.
-- 2) Run this file in the SQL editor.
-- 3) Put the public project URL and publishable key in cloud-config.js.

create table if not exists public.bubble_leaderboard (
  user_id uuid primary key references auth.users(id) on delete cascade,
  player_name text not null check (char_length(player_name) between 2 and 12),
  wins integer not null default 0 check (wins >= 0),
  games integer not null default 0 check (games >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),
  best_streak integer not null default 0 check (best_streak >= 0),
  best_combo integer not null default 0 check (best_combo >= 0),
  updated_at timestamptz not null default now()
);

alter table public.bubble_leaderboard enable row level security;

drop policy if exists "authenticated users can read leaderboard" on public.bubble_leaderboard;
create policy "authenticated users can read leaderboard"
on public.bubble_leaderboard
for select
to authenticated
using (true);

drop policy if exists "users can insert own leaderboard row" on public.bubble_leaderboard;
create policy "users can insert own leaderboard row"
on public.bubble_leaderboard
for insert
to authenticated
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "users can update own leaderboard row" on public.bubble_leaderboard;
create policy "users can update own leaderboard row"
on public.bubble_leaderboard
for update
to authenticated
using (auth.uid() is not null and auth.uid() = user_id)
with check (auth.uid() is not null and auth.uid() = user_id);

create index if not exists bubble_leaderboard_best_streak_idx
  on public.bubble_leaderboard (best_streak desc, wins desc);

create index if not exists bubble_leaderboard_best_combo_idx
  on public.bubble_leaderboard (best_combo desc, wins desc);

create index if not exists bubble_leaderboard_wins_idx
  on public.bubble_leaderboard (wins desc, best_streak desc);
