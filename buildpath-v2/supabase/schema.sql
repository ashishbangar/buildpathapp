-- BuildPath v2 schema
-- Students describe their idea on WhatsApp; the build happens on our website,
-- where Claude generates and explains code incrementally, then hands the student
-- one small modification per step.

create extension if not exists "pgcrypto";

create table schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  dashboard_token text unique not null default encode(gen_random_bytes(12), 'hex'),
  created_at timestamptz not null default now()
);

create table students (
  id uuid primary key default gen_random_uuid(),
  phone text unique not null,                 -- E.164 (usually the parent's phone)
  name text,
  school_id uuid references schools(id),
  class_name text,
  build_token text unique not null default encode(gen_random_bytes(12), 'hex'),   -- /build/<token>
  parent_token text unique not null default encode(gen_random_bytes(12), 'hex'),  -- /parent/<token>
  created_at timestamptz not null default now()
);

create index students_school on students(school_id);

create table projects (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  raw_idea text,
  scoping jsonb not null default '[]',         -- [{question, answer}]
  plan jsonb,                                  -- {title, summary, steps:[{title, goal}]}
  current_step int not null default 0,
  -- code accumulates here as the project grows, step by step
  code text not null default '',
  sub_state text not null default 'new',       -- new | scoping | plan_proposed | building | complete
  status text not null default 'active',       -- active | complete | abandoned
  minutes_spent int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_student_active on projects(student_id) where status = 'active';

-- Each completed step: the code Claude added, the kid-language explanation,
-- the prediction the student made, the challenge they were given, and whether
-- they completed the challenge themselves.
create table steps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  step_number int not null,
  title text not null,
  goal text,                                   -- what this step achieves, in kid language
  prediction text,                             -- student's prediction before building
  code_added text,                             -- the snippet Claude generated this step
  explanation text,                            -- kid-language narration of the code
  challenge text,                              -- the "now you do one piece yourself" task
  challenge_done boolean default false,        -- did they complete it unassisted?
  teachback_url text,                          -- voice-note explaining why
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index steps_project on steps(project_id, step_number);

create table messages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  direction text not null,                     -- in | out
  body text,
  media_url text,
  media_type text,
  created_at timestamptz not null default now()
);

alter table schools enable row level security;
alter table students enable row level security;
alter table projects enable row level security;
alter table steps enable row level security;
alter table messages enable row level security;
