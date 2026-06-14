-- Migration 03: voice-note teachback grading
-- Run after schema.sql in the Supabase SQL editor.

alter table steps add column teachback_transcript text;
alter table steps add column teachback_grade int;        -- 0-3: 0 none, 1 vague, 2 partial, 3 solid
alter table steps add column teachback_feedback text;    -- warm, kid-facing one-liner

-- A simple per-project understanding score = average teachback grade, surfaced
-- to parents and teachers as the real learning signal.
-- (Computed in code; no column needed, but you could materialise it if desired.)
