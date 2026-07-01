create extension if not exists pgcrypto;

create table if not exists marketing_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organization text,
  contact_type text not null default 'Agency Owner',
  stage text not null default 'New',
  priority text not null default 'Medium',
  phone text,
  email text,
  website text,
  city text,
  state text,
  source text,
  owner text,
  demo_date timestamptz,
  follow_up_date date,
  last_contact_date date,
  referral_source text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists marketing_activities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references marketing_contacts(id) on delete cascade,
  activity_type text not null default 'Note',
  activity_date timestamptz not null default now(),
  title text not null,
  notes text,
  outcome text,
  next_follow_up_date date,
  created_at timestamptz not null default now()
);

create table if not exists marketing_appointments (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references marketing_contacts(id) on delete set null,
  title text not null,
  appointment_type text not null default 'Demo',
  appointment_date date not null,
  appointment_time time,
  location text,
  notes text,
  status text not null default 'Scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketing_contacts_type
  on marketing_contacts(contact_type);

create index if not exists idx_marketing_contacts_stage
  on marketing_contacts(stage);

create index if not exists idx_marketing_contacts_follow_up
  on marketing_contacts(follow_up_date);

create index if not exists idx_marketing_activities_contact
  on marketing_activities(contact_id);

create index if not exists idx_marketing_appointments_date
  on marketing_appointments(appointment_date);

