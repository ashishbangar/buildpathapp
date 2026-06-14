import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function ParentView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const { data: student } = await supabase
    .from("students").select("*").eq("parent_token", token).maybeSingle();
  if (!student) return <Empty msg="This link isn't valid. Check the link BuildBot sent." />;

  const { data: project } = await supabase
    .from("projects").select("*")
    .eq("student_id", student.id)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!project?.plan) return <Empty msg="No project yet — your child is just getting started!" />;

  const { data: steps } = await supabase
    .from("steps").select("*").eq("project_id", project.id).order("step_number");

  const done = (steps || []).filter((s) => s.challenge_done).length;
  const total = project.plan.steps.length;
  const challengesDone = done; // each completed step = one self-made change
  const graded = (steps || []).filter((s) => typeof s.teachback_grade === "number");
  const understanding =
    graded.length > 0
      ? Math.round((graded.reduce((a, s) => a + (s.teachback_grade || 0), 0) / (graded.length * 3)) * 100)
      : null;
  const firstName = (student.name || "Your child").split(" ")[0];
  const lastTeachback = (steps || []).reverse().find((s) => s.teachback_transcript || s.explanation);

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "40px 24px 80px" }}>
      <div style={{ fontSize: 13, color: "var(--graphite-soft)" }}>This week · {firstName}&apos;s BuildPath</div>
      <h1 style={{ fontFamily: "var(--display)", fontSize: 26, fontWeight: 700, lineHeight: 1.3, marginTop: 4 }}>
        {firstName} is building <span style={{ color: "var(--circuit-deep)" }}>{project.plan.title}</span> — {project.plan.summary}
      </h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, margin: "24px 0" }}>
        {[
          [`${done}/${total}`, "steps built"],
          [String(challengesDone), "changed themselves"],
          [understanding !== null ? `${understanding}%` : "—", "understanding score"],
        ].map(([n, l]) => (
          <div key={l} style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px", textAlign: "center" }}>
            <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 24 }}>{n}</div>
            <div style={{ fontSize: 11.5, color: "var(--graphite-soft)", marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--graphite-soft)", marginBottom: 12 }}>
          What {firstName} did
        </div>
        {(steps || []).filter((s) => s.challenge_done).map((s) => (
          <div key={s.step_number} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <span style={{ color: "var(--circuit)" }}>✓</span>
            <div style={{ fontSize: 14 }}>{s.title}</div>
          </div>
        ))}
        {done === 0 && <p style={{ fontSize: 14, color: "var(--graphite-soft)" }}>Just getting started — check back soon!</p>}
      </div>

      {lastTeachback?.teachback_transcript && (
        <div style={{ background: "var(--circuit-bg)", borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--circuit-deep)", marginBottom: 8 }}>
            In {firstName}&apos;s own words
          </div>
          <p style={{ fontSize: 14, fontStyle: "italic", color: "var(--circuit-deep)", lineHeight: 1.5 }}>
            &ldquo;{lastTeachback.teachback_transcript}&rdquo;
          </p>
        </div>
      )}

      <div style={{ background: "var(--tool-yellow-bg)", borderRadius: 12, padding: "14px 18px", fontSize: 14, color: "var(--tool-yellow-deep)", lineHeight: 1.5 }}>
        <b>How you can help:</b> ask {firstName} to show you {project.plan.title} this weekend and explain
        why they built each part. Explaining it out loud is where the learning sticks.
      </div>
    </main>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "60px 24px" }}>
      <h1 style={{ fontFamily: "var(--display)", fontSize: 28, fontWeight: 700 }}>BuildPath</h1>
      <p style={{ color: "var(--graphite-soft)", marginTop: 8 }}>{msg}</p>
    </main>
  );
}
