import { NextRequest, NextResponse } from "next/server";
import { supabase, updateProject, type Project, type Student } from "@/lib/supabase";
import { buildStep } from "@/lib/claude";

export const maxDuration = 120; // code generation can take a while

async function load(token: string): Promise<{ student: Student; project: Project } | null> {
  const { data: student } = await supabase
    .from("students").select("*").eq("build_token", token).maybeSingle();
  if (!student) return null;
  const { data: project } = await supabase
    .from("projects").select("*")
    .eq("student_id", student.id).eq("status", "active")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!project) return null;
  return { student: student as Student, project: project as Project };
}

// GET: current workspace state (plan, code, current step, step record if any)
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  const loaded = await load(token);
  if (!loaded) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { project } = loaded;

  const { data: steps } = await supabase
    .from("steps").select("*").eq("project_id", project.id).order("step_number");

  return NextResponse.json({
    title: project.plan?.title,
    summary: project.plan?.summary,
    plan: project.plan,
    code: project.code,
    currentStep: project.current_step,
    status: project.status,
    steps: steps || [],
  });
}

// POST { token, action }
//   action="generate" -> build the current step (code + explanation + challenge)
//   action="prediction", prediction -> save the student's prediction
export async function POST(req: NextRequest) {
  const { token, action, prediction } = await req.json();
  const loaded = await load(token);
  if (!loaded) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { project } = loaded;

  if (project.status === "complete")
    return NextResponse.json({ done: true });

  const stepIdx = project.current_step - 1;
  const planStep = project.plan!.steps[stepIdx];

  if (action === "prediction") {
    await supabase.from("steps").upsert(
      {
        project_id: project.id,
        step_number: project.current_step,
        title: planStep.title,
        goal: planStep.goal,
        prediction: prediction || "",
      },
      { onConflict: "project_id,step_number" }
    );
    return NextResponse.json({ ok: true });
  }

  if (action === "generate") {
    const out = await buildStep({
      idea: project.raw_idea || "",
      plan: project.plan!,
      codeSoFar: project.code,
      stepNumber: project.current_step,
      stepGoal: planStep.goal,
    });

    await supabase.from("steps").upsert(
      {
        project_id: project.id,
        step_number: project.current_step,
        title: planStep.title,
        goal: planStep.goal,
        code_added: out.code_added_summary,
        explanation: out.code_added_summary,
        challenge: out.challenge,
      },
      { onConflict: "project_id,step_number" }
    );

    // Store the generated code as the project's current code (pre-challenge).
    await updateProject(project.id, { code: out.code });

    return NextResponse.json({
      predict_prompt: out.predict_prompt,
      code: out.code,
      explanation: out.code_added_summary,
      challenge: out.challenge,
      challenge_check: out.challenge_check,
      stepNumber: project.current_step,
      totalSteps: project.plan!.steps.length,
    });
  }

  return NextResponse.json({ error: "bad_action" }, { status: 400 });
}
