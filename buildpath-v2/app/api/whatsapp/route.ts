import { NextRequest, NextResponse } from "next/server";
import {
  getOrCreateStudent, getActiveProject, createProject, updateProject,
  logMessage, supabase, type Project,
} from "@/lib/supabase";
import { nextScopingMove, generatePlan } from "@/lib/claude";
import { sendWhatsApp, T } from "@/lib/whatsapp";

export const maxDuration = 60;

/**
 * WhatsApp is now ONLY for: greeting, scoping the idea, proposing the plan,
 * and nudging. The actual building moves to the website workspace once the
 * student replies DEAL.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const from = String(form.get("From") || "").replace("whatsapp:", "");
  const body = String(form.get("Body") || "").trim();
  const numMedia = Number(form.get("NumMedia") || 0);
  const mediaUrl = numMedia > 0 ? String(form.get("MediaUrl0")) : undefined;
  const mediaType = numMedia > 0 ? String(form.get("MediaContentType0") || "") : undefined;
  if (!from) return twiml();

  const student = await getOrCreateStudent(from);
  let project = await getActiveProject(student.id);
  const buildUrl = `${process.env.NEXT_PUBLIC_APP_URL}/build/${student.build_token}`;

  await logMessage({ studentId: student.id, projectId: project?.id ?? null, direction: "in", body });

  const reply = async (text: string) => {
    await sendWhatsApp(from, text);
    await logMessage({ studentId: student.id, projectId: project?.id ?? null, direction: "out", body: text });
  };

  if (!project) {
    project = await createProject(student.id);
    await reply(T.welcome());
    return twiml();
  }

  switch (project.sub_state) {
    case "new": {
      await updateProject(project.id, { raw_idea: body, sub_state: "scoping" });
      project.raw_idea = body;
      await advanceScoping(project, body, reply, true, buildUrl);
      break;
    }
    case "scoping": {
      await advanceScoping(project, body, reply, false, buildUrl);
      break;
    }
    case "plan_proposed": {
      if (/deal/i.test(body)) {
        await updateProject(project.id, { sub_state: "building", current_step: 1 });
        await reply(T.startBuilding(buildUrl));
      } else {
        await reply(`Reply *DEAL* when you're ready, and I'll open your workspace 🛠️`);
      }
      break;
    }
    case "building": {
      // A voice note during building is a teachback — transcribe, grade, advance.
      if (mediaUrl && mediaType?.startsWith("audio")) {
        const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/teachback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: student.build_token, mediaUrl }),
        });
        const data = await res.json();
        if (data.feedback) await reply(data.feedback);
        await reply(data.done ? `That's the whole app — you did it! 🏆` : T.nudge(buildUrl));
      } else {
        await reply(T.nudge(buildUrl));
      }
      break;
    }
    case "complete": {
      project = await createProject(student.id);
      await reply(T.welcome());
      break;
    }
  }
  return twiml();
}

async function advanceScoping(
  project: Project, latest: string,
  reply: (t: string) => Promise<void>, isIdea: boolean, buildUrl: string
) {
  const scoping = [...(project.scoping || [])];
  if (!isIdea && scoping.length > 0 && !scoping[scoping.length - 1].answer) {
    scoping[scoping.length - 1].answer = latest;
  }
  const answered = scoping.filter((s) => s.answer);
  const move = await nextScopingMove(project.raw_idea!, answered);

  if (move.type === "question" && answered.length < 3) {
    scoping.push({ question: move.message, answer: "" });
    await updateProject(project.id, { scoping });
    await reply(move.message);
    return;
  }

  const plan = await generatePlan(project.raw_idea!, answered);
  await updateProject(project.id, { plan, scoping, sub_state: "plan_proposed" });
  await reply(T.planProposed(plan, buildUrl));
}

function twiml() {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
    headers: { "Content-Type": "text/xml" },
  });
}
