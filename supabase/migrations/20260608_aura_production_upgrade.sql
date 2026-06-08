-- AURA AI Production Upgrade Migration
-- All tables: RLS enabled, service_role access only (backend uses service role key)
-- user_id is Firebase UID (text type)

create extension if not exists pgcrypto;

-- ============================================================
-- LIVE SESSIONS
-- ============================================================
create table if not exists public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  session_type text not null default 'live',
  transcript jsonb not null default '[]'::jsonb,
  context jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  fallback_count integer not null default 0,
  gemini_health text not null default 'healthy',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- LUMEN MEMORIES (structured long-term memory)
-- ============================================================
create table if not exists public.lumen_memories (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  category text not null default 'general',
  key text not null,
  value text not null,
  importance numeric not null default 0.5,
  access_count integer not null default 0,
  embedding text,
  tags jsonb not null default '[]'::jsonb,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accessed_at timestamptz not null default now()
);

-- ============================================================
-- EVOLUTION EXPERIENCES (persistent evolution runtime)
-- ============================================================
create table if not exists public.evolution_experiences (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  trigger_type text not null,
  trigger_data jsonb not null default '{}'::jsonb,
  response jsonb not null default '{}'::jsonb,
  outcome text,
  score numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- EVOLUTION SCORE CARDS
-- ============================================================
create table if not exists public.evolution_score_cards (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  dimension text not null,
  score numeric not null default 0,
  weight numeric not null default 1.0,
  trend text not null default 'stable',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- MODEL PERFORMANCE TRACKING
-- ============================================================
create table if not exists public.model_performance (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  model_name text not null,
  request_type text not null default 'chat',
  latency_ms integer not null default 0,
  success boolean not null default true,
  error_message text,
  tokens_used integer not null default 0,
  cost_usd numeric not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================
-- USER NOTES (study notes)
-- ============================================================
create table if not exists public.user_notes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null,
  content text not null default '',
  tags jsonb not null default '[]'::jsonb,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- USAGE METRICS (cost + rate tracking)
-- ============================================================
create table if not exists public.usage_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  metric_type text not null,
  metric_key text not null,
  metric_value numeric not null default 0,
  period text not null default 'daily',
  period_start date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- OBSERVABILITY LOGS
-- ============================================================
create table if not exists public.observability_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  severity text not null default 'info',
  session_id uuid,
  created_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_live_sessions_user on public.live_sessions(user_id);
create index if not exists idx_live_sessions_user_created on public.live_sessions(user_id, created_at desc);

create index if not exists idx_lumen_memories_user on public.lumen_memories(user_id);
create index if not exists idx_lumen_memories_user_category on public.lumen_memories(user_id, category);
create index if not exists idx_lumen_memories_user_importance on public.lumen_memories(user_id, importance desc);

create index if not exists idx_evolution_experiences_user on public.evolution_experiences(user_id);
create index if not exists idx_evolution_experiences_user_created on public.evolution_experiences(user_id, created_at desc);

create index if not exists idx_evolution_score_cards_user on public.evolution_score_cards(user_id);
create index if not exists idx_evolution_score_cards_user_dimension on public.evolution_score_cards(user_id, dimension);

create index if not exists idx_model_performance_user on public.model_performance(user_id);
create index if not exists idx_model_performance_user_created on public.model_performance(user_id, created_at desc);

create index if not exists idx_user_notes_user on public.user_notes(user_id);
create index if not exists idx_user_notes_user_created on public.user_notes(user_id, created_at desc);

create index if not exists idx_usage_metrics_user on public.usage_metrics(user_id);
create index if not exists idx_usage_metrics_user_period on public.usage_metrics(user_id, period, period_start);

create index if not exists idx_observability_logs_user on public.observability_logs(user_id);
create index if not exists idx_observability_logs_user_created on public.observability_logs(user_id, created_at desc);
create index if not exists idx_observability_logs_event_type on public.observability_logs(event_type);

-- ============================================================
-- RLS: enable on all new tables
-- ============================================================
alter table public.live_sessions enable row level security;
alter table public.lumen_memories enable row level security;
alter table public.evolution_experiences enable row level security;
alter table public.evolution_score_cards enable row level security;
alter table public.model_performance enable row level security;
alter table public.user_notes enable row level security;
alter table public.usage_metrics enable row level security;
alter table public.observability_logs enable row level security;

-- ============================================================
-- RLS POLICIES: service_role access (backend-only)
-- The FastAPI backend uses the service role key to access Supabase.
-- No direct client access is permitted.
-- ============================================================
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'live_sessions',
    'lumen_memories',
    'evolution_experiences',
    'evolution_score_cards',
    'model_performance',
    'user_notes',
    'usage_metrics',
    'observability_logs'
  ] loop
    execute format('drop policy if exists %I_service_role_all on public.%I', tbl, tbl);
    execute format('create policy %I_service_role_all on public.%I for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')', tbl, tbl);
  end loop;
end $$;
