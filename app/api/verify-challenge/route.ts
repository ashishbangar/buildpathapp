import { NextRequest, NextResponse } from "next/server";
import { supabase, updateProject, type Project, type Student } from "@/lib/supabase";
import { verifyChallenge } from "@/lib/claude";

export const maxDuration = 60;

// POST { token, codeAfter, challenge, challengeCheck }
// Verifies the student's own modification. On pass: record it, advance the step.
export async function POST(req: NextRequest) {
  const { token, codeAfter, challenge, challengeCheck } = await req.json();

  const { data: student } = await supabase
    .from("students").select("*").eq("build_token", token).maybeSingle();
  if (!student) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: project } = await supabase
    .from("projects").select("*")
    .eq("student_id", (student as Student).id).eq("status", "active")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const p = project as Project;

  const result = await verifyChallenge({
    challenge,
    challengeCheck,
    codeBefore: p.code,
    codeAfter,
  });

  if (!result.passed) {
    return NextResponse.json({ passed: false, feedback: result.feedback });
  }

  // Passed the challenge: save the student's edited code and mark the challenge
  // done — but do NOT advance yet. The teachback (explain WHY) is the final gate.
  await supabase.from("steps")
    .update({ challenge_done: true })
    .eq("project_id", p.id).eq("step_number", p.current_step);

  await updateProject(p.id, { code: codeAfter });

  return NextResponse.json({
    passed: true,
    feedback: result.feedback,
    needsTeachback: true,
    stepNumber: p.current_step,
    totalSteps: p.plan!.steps.length,
  });
}
