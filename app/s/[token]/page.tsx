import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Row = {
  name: string;
  className: string | null;
  projectTitle: string | null;
  idea: string | null;
  currentStep: number;
  totalSteps: number;
  status: string;
  lastActivity: string | null;
  daysSince: number | null;
};

export default async function TeacherDash({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const { data: school } = await supabase
    .from("schools").select("*").eq("dashboard_token", token).maybeSingle();
  if (!school) return <Empty msg="This dashboard link isn't valid." />;

  const { data: students } = await supabase
    .from("students").select("*").eq("school_id", school.id).order("name");

  const rows: Row[] = [];
  for (const s of students || []) {
    const { data: project } = await supabase
      .from("projects").select("*")
      .eq("student_id", s.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { data: lastMsg } = await supabase
      .from("messages").select("created_at")
      .eq("student_id", s.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const last = lastMsg?.created_at || null;
    const days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : null;
    rows.push({
      name: s.name || s.phone,
      className: s.class_name,
      projectTitle: project?.plan?.title ?? null,
      idea: project?.raw_idea ?? null,
      currentStep: project?.current_step ?? 0,
      totalSteps: project?.plan?.steps?.length ?? 0,
      status: project?.status ?? "not_started",
      lastActivity: last,
      daysSince: days,
    });
  }

  const started = rows.filter((r) => r.totalSteps > 0).length;
  const onTrack = rows.filter((r) => r.daysSince !== null && r.daysSince <= 2 && r.status === "active").length;
  const needHelp = rows.filter((r) => r.status === "not_started" || (r.daysSince !== null && r.daysSince >= 3)).length;
  const avg =
    started > 0
      ? Math.round(
          (rows.filter((r) => r.totalSteps > 0).reduce((a, r) => a + r.currentStep / r.totalSteps, 0) / started) * 100
        )
      : 0;

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: "32px 24px 80px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: "var(--display)", fontSize: 22, fontWeight: 700 }}>
            🏫 {school.name} · BuildPath
          </h1>
          <div style={{ fontSize: 13, color: "var(--graphite-soft)", marginTop: 2 }}>AI Builders Program · live class view</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(0,1fr))", gap: 12, marginBottom: 24 }}>
        {[
          [String(started), "students started"],
          [`${avg}%`, "avg progress"],
          [String(onTrack), "on track"],
          [String(needHelp), "need help"],
        ].map(([n, l], i) => (
          <div key={l} style={{ background: i === 3 && needHelp > 0 ? "#FCEBEB" : "#fff", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 18px" }}>
            <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 24, color: i === 3 && needHelp > 0 ? "#A32D2D" : "var(--graphite)" }}>{n}</div>
            <div style={{ fontSize: 12, color: "var(--graphite-soft)" }}>{l}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
          <colgroup><col style={{ width: "34%" }} /><col style={{ width: "30%" }} /><col style={{ width: "36%" }} /></colgroup>
          <thead>
            <tr>
              {["Student & project", "Progress", "Status"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "11px 16px", fontSize: 12, fontWeight: 600, color: "var(--graphite-soft)", borderBottom: "1px solid var(--line)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const pct = r.totalSteps ? Math.round((Math.max(r.currentStep - 1, 0) / r.totalSteps) * 100) : 0;
              const stuck = r.status === "not_started" || (r.daysSince !== null && r.daysSince >= 3);
              const complete = r.status === "complete";
              return (
                <tr key={i}>
                  <td style={{ padding: "11px 16px", borderBottom: "1px solid var(--line)" }}>
                    <div style={{ fontWeight: 500 }}>{r.name}{r.className ? ` · ${r.className}` : ""}</div>
                    <div style={{ fontSize: 12, color: "var(--graphite-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.projectTitle ? `${r.projectTitle} — ${r.idea}` : r.idea || "— no idea submitted —"}
                    </div>
                  </td>
                  <td style={{ padding: "11px 16px", borderBottom: "1px solid var(--line)" }}>
                    <div style={{ height: 7, borderRadius: 20, background: "#f1efe8", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${complete ? 100 : pct}%`, borderRadius: 20, background: stuck ? "#E24B4A" : complete ? "#534ab7" : "#1D9E75" }} />
                    </div>
                  </td>
                  <td style={{ padding: "11px 16px", borderBottom: "1px solid var(--line)" }}>
                    {complete ? (
                      <span style={{ fontSize: 12, color: "var(--circuit-deep)" }}>🏆 Done · {r.totalSteps}/{r.totalSteps}</span>
                    ) : stuck ? (
                      <span style={{ fontSize: 12, color: "#A32D2D" }}>
                        ⚠ {r.status === "not_started" ? "Never started" : `Step ${r.currentStep} · ${r.daysSince}d no activity`}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--graphite-soft)" }}>
                        Step {r.currentStep}/{r.totalSteps} · active {r.daysSince === 0 ? "today" : `${r.daysSince}d ago`}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={3} style={{ padding: "18px 16px", color: "var(--graphite-soft)" }}>No students enrolled yet.</td></tr>
            )}
          </tbody>
        </table>
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
