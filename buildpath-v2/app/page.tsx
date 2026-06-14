export default function Home() {
  return (
    <main>
      <section className="hero wrap">
        <span className="kicker">Pitch on WhatsApp · build on the web</span>
        <h1>
          Your kid pitches an app. <em>They build it — and understand every line.</em>
        </h1>
        <p className="lede">
          They describe their idea to BuildBot on WhatsApp. Then on their workspace, AI
          writes the code one step at a time, explains it in plain words, and hands them
          one piece to change themselves. No black box. Real understanding.
        </p>
        <div className="cta-row">
          <a className="btn primary" href="https://wa.me/910000000000?text=hi">
            Start on WhatsApp
          </a>
          <a className="btn ghost" href="#how">How it works</a>
        </div>
      </section>

      <section className="wrap" id="how" style={{ padding: "20px 24px 80px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 18 }}>
          {[
            ["1 · Pitch", "They tell BuildBot what they want to build. It asks 3 sharp questions to find the real problem."],
            ["2 · Predict", "Before any code is written, they predict what the feature needs to do. Thinking comes first."],
            ["3 · Build + understand", "AI writes the code and explains every part in plain words — like a patient older sibling."],
            ["4 · Their turn", "Every step, they change one piece themselves. That's how we know they actually get it."],
          ].map(([h, p]) => (
            <div key={h} style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 12, padding: "18px 20px" }}>
              <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 17, marginBottom: 6 }}>{h}</div>
              <p style={{ color: "var(--graphite-soft)", fontSize: 14.5 }}>{p}</p>
            </div>
          ))}
        </div>
      </section>

      <footer>
        <div className="wrap">BuildPath · Made in India, for builders everywhere · schools@buildpath.example</div>
      </footer>
    </main>
  );
}
