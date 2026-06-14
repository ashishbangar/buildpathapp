import Anthropic from "@anthropic-ai/sdk";
import type { Plan } from "./supabase";

let _a: Anthropic | null = null;
function ai(): Anthropic {
  if (!_a) _a = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  return _a;
}
const MODEL = "claude-sonnet-4-5";

function parseJson<T>(text: string): T {
  return JSON.parse(text.replace(/```json|```/g, "").trim()) as T;
}
function textOf(res: Anthropic.Message): string {
  return res.content.filter((b) => b.type === "text").map((b: any) => b.text).join("");
}

// ---------------------------------------------------------------------------
// 1. SCOPING — find the real problem inside a kid's idea (max 3 questions)
// ---------------------------------------------------------------------------
const SCOPING_SYSTEM = `You are BuildBot, a warm mentor on WhatsApp helping a student
(age 10-16) sharpen their app idea before building.

Ask AT MOST 3 short questions, ONE per message, to shrink the idea to a tiny v1.
Good questions find: who uses it, the single sharpest problem, the one exciting feature.
When an answer reveals the real problem, reflect it back in one sentence
("That's your real problem: ...") — this teaches product thinking.

Simple English an 11-year-old understands. Max 1-2 emoji. One question per message.

Output STRICT JSON only:
{"type":"question","message":"<next message ending in a question>"}
or {"type":"ready"} when you have enough.`;

export async function nextScopingMove(
  rawIdea: string,
  scoping: { question: string; answer: string }[]
): Promise<{ type: "question"; message: string } | { type: "ready" }> {
  const hist = scoping.map((s, i) => `Q${i + 1}: ${s.question}\nA${i + 1}: ${s.answer}`).join("\n");
  const res = await ai().messages.create({
    model: MODEL, max_tokens: 400, system: SCOPING_SYSTEM,
    messages: [{ role: "user", content: `Idea: "${rawIdea}"\n\nSo far:\n${hist || "(none)"}\n\nNext move? Max 3 questions then {"type":"ready"}.` }],
  });
  return parseJson(textOf(res));
}

// ---------------------------------------------------------------------------
// 2. PLAN — a 6-9 step build path. Steps are GOALS, not code yet.
// ---------------------------------------------------------------------------
const PLAN_SYSTEM = `You are BuildBot, planning a build for a student (age 10-16) who will
build a real web app on our website, where an AI assistant writes and explains the
code step by step.

Produce a v1 plan of 6-9 steps. Each step is a single, small, visible goal a beginner
can understand. The app is a simple single-file HTML/CSS/JS web app (no servers, no
build tools, no login) so it always runs in a browser.

Rules:
- Step 1 must produce something VISIBLE (a titled screen).
- Each later step adds ONE feature.
- The final step is always "test it with the real person it is for."
- Keep goals in kid language ("Make the app remember if she took her medicine").

Output STRICT JSON only:
{"title":"<fun name, max 3 words>","summary":"<2 sentences, kid language>","steps":[{"title":"<3-6 words>","goal":"<one kid-language sentence>"}, ...]}`;

export async function generatePlan(
  rawIdea: string,
  scoping: { question: string; answer: string }[]
): Promise<Plan> {
  const hist = scoping.map((s) => `Q: ${s.question}\nA: ${s.answer}`).join("\n");
  const res = await ai().messages.create({
    model: MODEL, max_tokens: 1500, system: PLAN_SYSTEM,
    messages: [{ role: "user", content: `Idea: "${rawIdea}"\n\nScoping:\n${hist}` }],
  });
  return parseJson<Plan>(textOf(res));
}

// ---------------------------------------------------------------------------
// 3. THE BUILDER — the heart of the product.
// Generates the code for ONE step, explains it in kid language, and ALWAYS
// hands the student one small modification to do themselves.
// ---------------------------------------------------------------------------
const BUILDER_SYSTEM = `You are BuildBot's builder, helping a student (age 10-16) build their
web app ONE step at a time. You write the code, but your real job is to make the student
UNDERSTAND it — and then do one small piece themselves.

You receive: the project idea, the full plan, the code so far, and the current step's goal.

You must return, as STRICT JSON:
{
  "predict_prompt": "<a one-sentence question asking the student to predict what the code will need to do, BEFORE they see it>",
  "code": "<the COMPLETE updated single-file app (HTML+CSS+JS in one file) after adding THIS step's feature. Always return the whole file so it runs.>",
  "code_added_summary": "<2-4 sentences in SIMPLE kid language explaining what you added and what the key lines do. Use analogies (an alarm, a notebook, a checklist). NEVER use jargon like 'instantiate', 'DOM', 'event listener' without immediately explaining it in plain words.>",
  "challenge": "<ONE small, specific modification the student must make THEMSELVES, unassisted, to prove they understood. It must be tiny and findable in the code you wrote — e.g. 'Change the reminder time from 9pm to 8pm yourself' or 'Make the Taken button green instead of blue'. Phrase it as a friendly dare.>",
  "challenge_check": "<a short machine-checkable description of what the code should look like AFTER the student completes the challenge, so we can verify it — e.g. 'the time value is 20 or 8 PM instead of 21 or 9 PM' >"
}

Hard rules:
- The code must be a COMPLETE, runnable single HTML file every time (so the preview always works).
- Add only what THIS step needs. Do not jump ahead.
- Explanations are pitched to an 11-year-old. Two sentences of plain words beat one correct sentence of jargon.
- The challenge is never "do you understand?" — it is always a concrete thing they DO.
- Keep the app simple, friendly, and large-text (kids and the people they build for).`;

export type BuilderOutput = {
  predict_prompt: string;
  code: string;
  code_added_summary: string;
  challenge: string;
  challenge_check: string;
};

export async function buildStep(args: {
  idea: string;
  plan: Plan;
  codeSoFar: string;
  stepNumber: number;
  stepGoal: string;
}): Promise<BuilderOutput> {
  const res = await ai().messages.create({
    model: MODEL, max_tokens: 4000, system: BUILDER_SYSTEM,
    messages: [{
      role: "user",
      content: `Idea: "${args.idea}"

Plan: ${JSON.stringify(args.plan.steps.map((s, i) => `${i + 1}. ${s.title}`))}

Code so far:
${args.codeSoFar || "(empty — this is step 1)"}

Current step ${args.stepNumber}: ${args.stepGoal}

Build this step now.`,
    }],
  });
  return parseJson<BuilderOutput>(textOf(res));
}

// ---------------------------------------------------------------------------
// 4. CHALLENGE VERIFICATION — did the student's own edit satisfy the challenge?
// ---------------------------------------------------------------------------
export async function verifyChallenge(args: {
  challenge: string;
  challengeCheck: string;
  codeBefore: string;
  codeAfter: string;
}): Promise<{ passed: boolean; feedback: string }> {
  const res = await ai().messages.create({
    model: MODEL, max_tokens: 300,
    messages: [{
      role: "user",
      content: `A student was given this challenge to do themselves:
"${args.challenge}"

It passes if: ${args.challengeCheck}

CODE BEFORE their edit:
${args.codeBefore}

CODE AFTER their edit:
${args.codeAfter}

Did the student make the change themselves? Be encouraging but honest. If they didn't
change the right thing, say what to look for in one friendly kid-friendly sentence.

Output STRICT JSON only: {"passed": true/false, "feedback": "<one warm sentence>"}`,
    }],
  });
  try { return parseJson(textOf(res)); }
  catch { return { passed: true, feedback: "Nice work — that looks right!" }; }
}

// ---------------------------------------------------------------------------
// 5. TEACHBACK GRADING — transcribe the student's voice note, then grade whether
// they actually understood WHY the step mattered. This is the real learning signal.
// ---------------------------------------------------------------------------

/**
 * Transcribe a voice note. Twilio media needs basic auth to fetch.
 * Uses Groq's Whisper endpoint (fast + cheap) if GROQ_API_KEY is set; otherwise
 * falls back to OpenAI Whisper if OPENAI_API_KEY is set. Either works — both are
 * standard multipart Whisper APIs.
 */
export async function transcribeVoiceNote(mediaUrl: string): Promise<string> {
  const auth = Buffer.from(
    `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
  ).toString("base64");
  const audioRes = await fetch(mediaUrl, { headers: { Authorization: `Basic ${auth}` } });
  const audioBuf = Buffer.from(await audioRes.arrayBuffer());

  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const endpoint = groqKey
    ? "https://api.groq.com/openai/v1/audio/transcriptions"
    : "https://api.openai.com/v1/audio/transcriptions";
  const key = groqKey || openaiKey;
  if (!key) throw new Error("No transcription key set (GROQ_API_KEY or OPENAI_API_KEY).");
  const model = groqKey ? "whisper-large-v3-turbo" : "whisper-1";

  const fd = new FormData();
  fd.append("file", new Blob([audioBuf], { type: "audio/ogg" }), "note.ogg");
  fd.append("model", model);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  });
  const data = await res.json();
  return (data.text || "").trim();
}

const TEACHBACK_SYSTEM = `You are grading a school student's (age 10-16) spoken explanation of
WHY a step in their app mattered. You are warm and encouraging — this is a child.

You receive: the step goal, the kid-language explanation they were shown, and a transcript
of the student explaining it back in their own words.

Grade their UNDERSTANDING of the WHY, not their vocabulary or grammar:
- 3 = solid: they explain the purpose/reason in their own words, even simply.
- 2 = partial: they get the gist but miss the core reason, or just restate what it does.
- 1 = vague: they say something on-topic but show little understanding.
- 0 = none / off-topic / empty.

Output STRICT JSON only:
{"grade": 0-3, "feedback": "<one warm sentence to the student. If 3, celebrate. If 1-2, gently point at what to think about. Never harsh.>"}`;

export async function gradeTeachback(args: {
  stepGoal: string;
  explanationShown: string;
  transcript: string;
}): Promise<{ grade: number; feedback: string }> {
  if (!args.transcript || args.transcript.length < 3) {
    return { grade: 0, feedback: "I couldn't hear an explanation — try recording again!" };
  }
  const res = await ai().messages.create({
    model: MODEL, max_tokens: 200, system: TEACHBACK_SYSTEM,
    messages: [{
      role: "user",
      content: `Step goal: ${args.stepGoal}
Explanation they were shown: ${args.explanationShown}
What the student said: "${args.transcript}"

Grade their understanding of the WHY.`,
    }],
  });
  try { return parseJson(textOf(res)); }
  catch { return { grade: 2, feedback: "Nice explaining — keep going!" }; }
}
