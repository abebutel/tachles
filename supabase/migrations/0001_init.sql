-- ==================================================
-- Tachles beta — initial schema
-- profiles, beta_invites, RLS, signup trigger
-- Run this in Supabase Dashboard → SQL Editor
-- ==================================================

-- ============================================
-- Profiles table (extends auth.users)
-- ============================================

create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  full_name text,
  preferred_language text default 'he' check (preferred_language in ('en', 'he')),
  beta_consent_version text,
  beta_consent_accepted_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- ============================================
-- Beta invites (allowlist of invited emails)
-- ============================================

create table public.beta_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  invited_by text,
  invited_at timestamptz default now() not null,
  used_at timestamptz,
  notes text
);

create unique index beta_invites_email_lower_idx
  on public.beta_invites (lower(email));

-- ============================================
-- Helper: updated_at trigger function
-- ============================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============================================
-- Trigger: when a new auth user signs up,
-- create their profile only if email is on invite list
-- ============================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.beta_invites
    where lower(email) = lower(new.email)
  ) then
    insert into public.profiles (id, email, full_name)
    values (
      new.id,
      new.email,
      coalesce(
        new.raw_user_meta_data->>'full_name',
        new.raw_user_meta_data->>'name'
      )
    );

    update public.beta_invites
    set used_at = now()
    where lower(email) = lower(new.email);
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================
-- Row Level Security
-- ============================================

alter table public.profiles enable row level security;
alter table public.beta_invites enable row level security;

-- profiles: users can read and update their own row
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- beta_invites: no anon/authenticated access (only service_role bypasses RLS)
-- No policies = no rows visible to anyone except service_role
