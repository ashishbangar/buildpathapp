import twilio from "twilio";
import type { Plan } from "./supabase";

let _t: ReturnType<typeof twilio> | null = null;
function tw() {
  if (!_t) _t = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
  return _t;
}

export async function sendWhatsApp(to: string, body: string) {
  await tw().messages.create({
    from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
    to: `whatsapp:${to}`,
    body,
  });
}

export const T = {
  welcome: () =>
    `Hi! I'm BuildBot 🤖 I help you build a real, working app — your own idea, one small step at a time.\n\nWhat do you want to build? Tell me in a line or two. It can be for anyone — your family, your friends, your class.`,

  planProposed: (plan: Plan, buildUrl: string) =>
    `Here's your build plan — *${plan.title}* 🎯\n\n${plan.summary}\n\nThat's ${plan.steps.length} steps. We build each one together on your workspace — I write the code, explain it, then YOU change one piece yourself.\n\n🛠️ Your workspace: ${buildUrl}\n\nReply *DEAL* to begin.`,

  startBuilding: (buildUrl: string) =>
    `Let's build 🔥 Open your workspace and we'll do Step 1 together:\n\n${buildUrl}\n\nEverything happens there now — come back here anytime for your progress.`,

  nudge: (buildUrl: string) =>
    `Your app is waiting! Open your workspace to keep building:\n${buildUrl}`,

  stepDoneAtState: (n: number, total: number) =>
    n >= total
      ? `You did it — all ${total} steps! 🏆 Your app is real and you understand every part of it. Show the person you built it for.\n\nWant to build something new? Just tell me your next idea.`
      : `Step ${n} done ✅ ${total - n} to go. Open your workspace when you're ready for the next one.`,
};
