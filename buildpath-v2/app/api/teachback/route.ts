import { NextRequest, NextResponse } from "next/server";
import { supabase, updateProject, type Project, type Student } from "@/lib/supabase";
import { transcribeVoiceNote, gradeTeachback } from "@/lib/claude";

export const maxDuration = 90;

/**
 * The final gate of each step: the student explains WHY the step mattered.
 * Two ways in:
 *   - multipart/form-data with `token` + `audio` (recorded in the workspace)
 *   - application/json with { token, mediaUrl } (a Twilio WhatsApp voice note)
 * Transcribe -> grade -> store -> advance the step (or complete the project).
 */
export async function POST(req: NextRequest) {
  let token = "";
  let transcript = "";

  const contentType = req.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      const { token: t, mediaUrl } = await req.json();
      token = t;
      transcript = await transcribeVoiceNote(mediaUrl);
    } else {
      const form = await req.formData();
      token = String(form.get("token") || "");
      const audio = form.get("audio") as File | null;
      if (audio) {
        // Reuse the same Whisper path by writing a temporary fetchable blob is overkill;
        // instead transcribe the uploaded file directly.
        transcript = await transcribeUploadedAudio(audio);
      }
    }
  } catch (e) {
    return NextResponse.json(
      { error: "transcription_failed", feedback: "I couldn't process that recording — try again!" },
      { status: 200 }
    );
  }

  const { data: student } = await supabase
    .from("students").select("*").eq("build_token", token).maybeSingle();
  if (!student) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: project } = await supabase
    .from("projects").select("*")
    .eq("student_id", (student as Student).id).eq("status", "active")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const p = project as Project;

  const planStep = p.plan!.steps[p.current_step - 1];
  const { data: stepRow } = await supabase
    .from("steps").select("explanation")
    .eq("project_id", p.id).eq("step_number", p.current_step).maybeSingle();

  const { grade, feedback } = await gradeTeachback({
    stepGoal: planStep.goal,
    explanationShown: stepRow?.explanation || planStep.goal,
    transcript,
  });

  await supabase.from("steps").update({
    teachback_transcript: transcript,
    teachback_grade: grade,
    teachback_feedback: feedback,
    completed_at: new Date().toISOString(),
  }).eq("project_id", p.id).eq("step_number", p.current_step);

  // A grade of 0 means we couldn't tell they understood — let them retry rather
  // than block progress forever, but flag it (grade stored) for the teacher.
  const total = p.plan!.steps.length;
  const isLast = p.current_step >= total;

  await updateProject(p.id, {
    current_step: isLast ? p.current_step : p.current_step + 1,
    sub_state: isLast ? "complete" : "building",
    status: isLast ? "complete" : "active",
    minutes_spent: p.minutes_spent + 20,
  });

  return NextResponse.json({
    grade,
    feedback,
    transcript,
    done: isLast,
    nextStep: isLast ? null : p.current_step + 1,
  });
}

/** Transcribe an uploaded audio File directly via Whisper (Groq or OpenAI). */
async function transcribeUploadedAudio(audio: File): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const key = groqKey || openaiKey;
  if (!key) throw new Error("No transcription key set.");
  const endpoint = groqKey
    ? "https://api.groq.com/openai/v1/audio/transcriptions"
    : "https://api.openai.com/v1/audio/transcriptions";
  const model = groqKey ? "whisper-large-v3-turbo" : "whisper-1";

  const fd = new FormData();
  fd.append("file", audio, audio.name || "note.webm");
  fd.append("model", model);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  });
  const data = await res.json();
  return (data.text || "").trim();
}
