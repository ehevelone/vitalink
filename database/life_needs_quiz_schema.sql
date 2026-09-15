create extension if not exists pgcrypto;

create table if not exists life_needs_quiz_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  contact_preference text,
  answers jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  consent_accepted boolean not null default false,
  consent_language text not null,
  consent_page text not null,
  consent_captured_at timestamptz not null,
  ip_address text,
  user_agent text,
  notification_status text not null default 'pending',
  notification_error text,
  email_sent_at timestamptz,
  source text not null default 'life_needs_quiz',
  created_at timestamptz not null default now()
);

alter table life_needs_quiz_leads
  drop column if exists marketing_contact_id,
  add column if not exists contact_preference text,
  add column if not exists notification_status text not null default 'pending',
  add column if not exists notification_error text,
  add column if not exists email_sent_at timestamptz;

create index if not exists idx_life_needs_quiz_leads_email
  on life_needs_quiz_leads(email);

create index if not exists idx_life_needs_quiz_leads_created
  on life_needs_quiz_leads(created_at);
