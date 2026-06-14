# BuildPath v2

Kids pitch their own app idea on WhatsApp, then build it on **our** workspace —
where Claude writes the code one step at a time, **explains every part in plain
words**, and hands the student **one small piece to change themselves** at every
step. That last beat is the whole point: it's the difference between a kid who
*watched* an app get built and a kid who *understands* the one they built.

## The five-beat loop (the heart of the product)

For every step:

1. **Goal** — the chat states one small goal in kid language
   ("Make the app remember if she took her medicine").
2. **Predict** — before any code, the student predicts what the feature needs to do.
3. **Build + explain** — Claude writes the complete updated app and narrates the
   new code in plain words, with analogies, no jargon.
4. **Their turn** — Claude sets one tiny, concrete modification the student must
   make *themselves* in the code editor ("change the reminder time to 8pm yourself").
5. **Verify** — Claude checks the student's edit. Pass → next step. Fail → a warm
   hint and another try.

Passive reading of good explanations creates the *illusion* of understanding.
Beat 4 is the only part that can't be faked by nodding — so it's mandatory.

## Architecture

- **WhatsApp** (Twilio): greeting, idea scoping (≤3 questions), plan proposal, nudges.
  Once the student replies DEAL, building moves to the website.
- **Build workspace** (`/build/[token]`): a Lovable-style page with a live preview
  (sandboxed iframe), a code editor, and the five-beat loop driven by Claude.
- **Parent view** (`/parent/[token]`): weekly progress, what the child built, what
  they changed themselves, and a nudge to ask the child to explain it. Retention engine.
- **Teacher dashboard** (`/s/[token]`): class roster with stall detection (flags
  students with 3+ days no activity, or who never started).

## Stack

Next.js 15 · Supabase · Claude API (Sonnet) · Twilio WhatsApp — your existing stack.

## The Claude prompts (in `lib/claude.ts`)

- `nextScopingMove` — finds the real problem inside a kid's idea, ≤3 questions.
- `generatePlan` — 6-9 step plan; steps are *goals*, not code.
- `buildStep` — **the core.** Returns: a prediction prompt, the complete updated
  single-file app, a kid-language explanation, a self-modification challenge, and a
  machine-checkable description of what "done" looks like.
- `verifyChallenge` — compares code-before vs code-after to confirm the student
  made the change themselves.

The app is always a single self-contained HTML file, so the live preview always
runs and there's no build tooling for a child to fight.

## Setup (~30 min)

1. **Supabase**: run `supabase/schema.sql`. Copy URL + service_role key.
2. **Anthropic**: API key from console.anthropic.com.
3. **Twilio WhatsApp sandbox** (free, instant): join the sandbox, copy SID + token + number.
4. `cp .env.example .env.local`, fill in, then:
   ```bash
   npm install && npm run dev
   ngrok http 3000
   # point the Twilio WhatsApp webhook at https://<ngrok>/api/whatsapp
   ```
5. WhatsApp "hi" to the sandbox number → BuildBot replies → pitch an idea →
   reply DEAL → open the workspace link → build.

### Onboard a pilot school
```sql
insert into schools (name, city) values ('DPS Sector 45', 'Gurgaon')
  returning dashboard_token;     -- open /s/<dashboard_token>
update students set school_id='<id>', class_name='7B', name='Ananya'
  where phone='+91XXXXXXXXXX';
```

## Production notes

- **The builder prompt is the product.** Its register (plain words for an 11-year-old,
  always) and its discipline (build incrementally, never jump ahead, always hand back
  one challenge) decide whether this teaches or just produces apps. Test it against
  real kids — the failure mode (jargon, too much code at once) is invisible until a
  confused child hits it. Review/iterate the prompt as your top priority.
- **Voice-note teachbacks**: schema has `teachback_url`; wire WhatsApp voice notes
  (or in-workspace recording) + transcription to grade explanations. That grade is
  your per-student learning signal for school reports.
- **WhatsApp Business API**: sandbox is dev-only; apply for a real number for launch.
- **Recipient is usually a parent's phone** — a feature, not a bug. The parent sees
  progress and becomes your referrer.
- **Human-review generated plans and first few builds** before scaling to a class.

## File map

```
app/api/whatsapp/route.ts        WhatsApp: scoping + plan + handoff
app/api/build/route.ts           workspace state + step code generation
app/api/verify-challenge/route.ts checks the student's own edit, advances the step
app/build/[token]/Workspace.tsx  the five-beat build loop UI (live preview + editor)
app/parent/[token]/page.tsx      parent progress view
app/s/[token]/page.tsx           teacher dashboard with stall detection
lib/claude.ts                    scoping, planning, builder, verifier prompts
lib/whatsapp.ts                  Twilio sender + message templates
lib/supabase.ts                  data layer
supabase/schema.sql              database schema
```
