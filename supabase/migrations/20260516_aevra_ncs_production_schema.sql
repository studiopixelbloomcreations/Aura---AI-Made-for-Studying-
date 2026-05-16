create extension if not exists pgcrypto;

create table if not exists public.voice_identity_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  display_name text,
  wake_word text not null default 'hey aevra',
  embedding jsonb not null default '{}'::jsonb,
  enrollment_phrases jsonb not null default '[]'::jsonb,
  verification_score numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.memory_graph_nodes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  node_type text not null,
  label text not null,
  properties jsonb not null default '{}'::jsonb,
  importance numeric not null default 0.5,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.memory_graph_edges (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  source_node_id uuid not null references public.memory_graph_nodes(id) on delete cascade,
  target_node_id uuid not null references public.memory_graph_nodes(id) on delete cascade,
  relation text not null,
  weight numeric not null default 0.5,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ncs_performance_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  system_type text not null,
  confidence numeric not null default 0,
  model_used text,
  routing_success boolean not null default false,
  response_quality numeric not null default 0,
  latency_ms integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.harmony_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  workflow text not null,
  models jsonb not null default '[]'::jsonb,
  routing_chain jsonb not null default '[]'::jsonb,
  confidence numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.evolution_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  signal_type text not null,
  signal jsonb not null default '{}'::jsonb,
  applied boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.personality_configs (
  user_id text primary key,
  tone text not null default 'warm',
  humor text not null default 'light',
  pacing text not null default 'adaptive',
  verbosity text not null default 'balanced',
  teaching_style text not null default 'stepwise',
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.exam_question_bank (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  grade text not null default '9',
  difficulty text not null default 'medium',
  question text not null,
  answer text not null,
  explanation text not null default '',
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.exam_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  subject text not null,
  difficulty text not null default 'adaptive',
  score numeric not null default 0,
  analytics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_voice_identity_profiles_user on public.voice_identity_profiles(user_id);
create index if not exists idx_memory_graph_nodes_user on public.memory_graph_nodes(user_id);
create index if not exists idx_memory_graph_edges_user on public.memory_graph_edges(user_id);
create index if not exists idx_ncs_performance_logs_user_created on public.ncs_performance_logs(user_id, created_at desc);
create index if not exists idx_exam_question_bank_subject on public.exam_question_bank(subject, difficulty);
create index if not exists idx_analytics_events_user_created on public.analytics_events(user_id, created_at desc);

alter table public.voice_identity_profiles enable row level security;
alter table public.memory_graph_nodes enable row level security;
alter table public.memory_graph_edges enable row level security;
alter table public.ncs_performance_logs enable row level security;
alter table public.harmony_logs enable row level security;
alter table public.evolution_logs enable row level security;
alter table public.personality_configs enable row level security;
alter table public.exam_question_bank enable row level security;
alter table public.exam_sessions enable row level security;
alter table public.analytics_events enable row level security;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'voice_identity_profiles',
    'memory_graph_nodes',
    'memory_graph_edges',
    'ncs_performance_logs',
    'harmony_logs',
    'evolution_logs',
    'personality_configs',
    'exam_sessions',
    'analytics_events'
  ] loop
    execute format('drop policy if exists service_role_all on public.%I', tbl);
    execute format('create policy service_role_all on public.%I for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')', tbl);
  end loop;
end $$;

drop policy if exists exam_question_bank_read on public.exam_question_bank;
create policy exam_question_bank_read on public.exam_question_bank for select using (true);
drop policy if exists exam_question_bank_service_write on public.exam_question_bank;
create policy exam_question_bank_service_write on public.exam_question_bank for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

insert into public.exam_question_bank(subject, difficulty, question, answer, explanation, tags)
values
  ('Maths', 'easy', 'Simplify 3x + 2x.', '5x', 'Like terms add by combining their coefficients: 3 + 2 = 5.', '["algebra"]'::jsonb),
  ('Science', 'easy', 'Name the process by which plants make food.', 'Photosynthesis', 'Plants use sunlight, carbon dioxide, and water to make glucose and oxygen.', '["biology","plants"]'::jsonb),
  ('English', 'medium', 'Identify the adjective in: The bright moon rose slowly.', 'bright', 'Bright describes the noun moon, so it is the adjective.', '["grammar"]'::jsonb),
  ('History', 'medium', 'What is a primary historical source?', 'Evidence created during the time being studied', 'Primary sources come directly from the period or event, such as letters, records, or artifacts.', '["sources"]'::jsonb),
  ('Geography', 'medium', 'What does a contour line show on a map?', 'Elevation', 'Contour lines join places of equal height above sea level.', '["maps"]'::jsonb),
  ('ICT', 'easy', 'What does CPU stand for?', 'Central Processing Unit', 'The CPU executes instructions and coordinates computer processing.', '["hardware"]'::jsonb)
on conflict do nothing;
