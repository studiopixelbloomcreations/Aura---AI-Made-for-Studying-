create extension if not exists pgcrypto;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  grade integer default 9,
  school text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.user_profiles add column if not exists id uuid;
alter table public.user_profiles add column if not exists display_name text;
alter table public.user_profiles add column if not exists grade integer default 9;
alter table public.user_profiles add column if not exists school text;
alter table public.user_profiles add column if not exists created_at timestamptz default now();
alter table public.user_profiles add column if not exists updated_at timestamptz default now();
create unique index if not exists user_profiles_id_unique on public.user_profiles(id) where id is not null;

create table if not exists public.voice_signatures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.user_profiles(id) on delete cascade,
  embedding float8[] not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.personalization_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.user_profiles(id) on delete cascade,
  tone text default 'friendly',
  humor_level integer default 5,
  verbosity text default 'medium',
  teaching_style text default 'socratic',
  language text default 'en',
  subjects jsonb default '[]'::jsonb,
  raw_config jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id)
);

create table if not exists public.conversation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.user_profiles(id) on delete cascade,
  session_type text default 'chat',
  messages jsonb default '[]'::jsonb,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.gamification_data (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.user_profiles(id) on delete cascade,
  points integer default 0,
  streak_days integer default 0,
  last_active_date date,
  badges jsonb default '[]'::jsonb,
  level integer default 1,
  total_sessions integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id)
);

create table if not exists public.exam_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.user_profiles(id) on delete cascade,
  subject text not null,
  term_test integer,
  questions jsonb default '[]'::jsonb,
  answers jsonb default '[]'::jsonb,
  score float default 0,
  completed boolean default false,
  started_at timestamptz default now(),
  completed_at timestamptz
);

alter table public.user_profiles enable row level security;
alter table public.voice_signatures enable row level security;
alter table public.personalization_configs enable row level security;
alter table public.conversation_sessions enable row level security;
alter table public.gamification_data enable row level security;
alter table public.exam_sessions enable row level security;

drop policy if exists "Users manage own profile" on public.user_profiles;
create policy "Users manage own profile" on public.user_profiles for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Users manage own voice signatures" on public.voice_signatures;
create policy "Users manage own voice signatures" on public.voice_signatures for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own personalization" on public.personalization_configs;
create policy "Users manage own personalization" on public.personalization_configs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own conversations" on public.conversation_sessions;
create policy "Users manage own conversations" on public.conversation_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own gamification" on public.gamification_data;
create policy "Users manage own gamification" on public.gamification_data for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own exams" on public.exam_sessions;
create policy "Users manage own exams" on public.exam_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
