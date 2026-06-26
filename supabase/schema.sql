create table if not exists public.quiz_results (
  id bigserial primary key,
  submitted_at timestamptz not null default now(),
  quiz text not null default '',
  question_set text not null default '',
  course text not null default '',
  name text not null default '',
  "class" text not null default '',
  student_id text not null default '',
  score numeric not null default 0,
  total numeric not null default 0,
  percent numeric not null default 0,
  correct numeric not null default 0,
  questions numeric not null default 0,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer not null default 0,
  answers_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

grant usage on schema public to anon;

alter table public.quiz_results enable row level security;

revoke all on table public.quiz_results from anon, authenticated;
grant insert on table public.quiz_results to anon;
grant usage, select on sequence public.quiz_results_id_seq to anon;

drop policy if exists quiz_results_insert_public on public.quiz_results;
create policy quiz_results_insert_public
  on public.quiz_results
  for insert
  to anon
  with check (true);

create index if not exists quiz_results_submitted_at_idx
  on public.quiz_results (submitted_at desc);

create index if not exists quiz_results_question_set_idx
  on public.quiz_results (question_set);

create table if not exists public.quiz_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.quiz_settings enable row level security;
revoke all on table public.quiz_settings from anon, authenticated;

insert into public.quiz_settings (key, value)
values ('stats_token', 'Lei123')
on conflict (key) do nothing;

create or replace function public.quiz_results_for_stats(p_token text)
returns table (
  id bigint,
  submitted_at timestamptz,
  quiz text,
  question_set text,
  course text,
  name text,
  "class" text,
  student_id text,
  score numeric,
  total numeric,
  percent numeric,
  correct numeric,
  questions numeric,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  answers_json jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_token text;
begin
  select value
    into expected_token
    from public.quiz_settings
   where key = 'stats_token';

  if expected_token is null
     or expected_token = 'Lei123'
     or p_token is null
     or p_token <> expected_token then
    raise exception 'invalid stats token';
  end if;

  return query
    select
      r.id,
      r.submitted_at,
      r.quiz,
      r.question_set,
      r.course,
      r.name,
      r."class",
      r.student_id,
      r.score,
      r.total,
      r.percent,
      r.correct,
      r.questions,
      r.started_at,
      r.ended_at,
      r.duration_seconds,
      r.answers_json
    from public.quiz_results as r
    order by r.submitted_at desc;
end;
$$;

revoke all on function public.quiz_results_for_stats(text) from public;
grant execute on function public.quiz_results_for_stats(text) to anon;

-- Run this after changing the token below to your own teacher password.
update public.quiz_settings
    set value = 'Lei123', updated_at = now()
  where key = 'stats_token';
