"use client";

import { useEffect, useState, useRef } from "react";

type BuildState = {
  title?: string;
  summary?: string;
  plan?: { steps: { title: string; goal: string }[] };
  code: string;
  currentStep: number;
  status: string;
  steps: { step_number: number; title: string; challenge_done: boolean }[];
};

type StepData = {
  predict_prompt: string;
  code: string;
  explanation: string;
  challenge: string;
  challenge_check: string;
  stepNumber: number;
  totalSteps: number;
};

type Phase = "loading" | "predict" | "explain" | "challenge" | "verifying" | "teachback" | "grading" | "done";

const C = {
  graphite: "#23272e",
  soft: "#4b5058",
  card: "#fff",
  yellow: "#ffc24b",
  yellowDeep: "#8a5b00",
  yellowBg: "#fff7e6",
  circuit: "#1fa66a",
  circuitDeep: "#0c5c3a",
  circuitBg: "#e3f5ec",
  violet: "#534ab7",
  violetBg: "#eeedfe",
  line: "#e7e4dc",
  workbench: "#fbfaf7",
};

export default function Workspace({ token }: { token: string }) {
  const [state, setState] = useState<BuildState | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [step, setStep] = useState<StepData | null>(null);
  const [prediction, setPrediction] = useState("");
  const [editorCode, setEditorCode] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [recording, setRecording] = useState(false);
  const [grade, setGrade] = useState<number | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // initial load
  useEffect(() => {
    fetch(`/api/build?token=${token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: BuildState) => {
        setState(d);
        setEditorCode(d.code || "");
        if (d.status === "complete") setPhase("done");
        else setPhase("predict");
      })
      .catch(() => setNotFound(true));
  }, [token]);

  // keep the live preview in sync with the editor
  useEffect(() => {
    if (iframeRef.current && editorCode) {
      iframeRef.current.srcdoc = editorCode;
    }
  }, [editorCode]);

  async function submitPrediction() {
    await fetch("/api/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action: "prediction", prediction }),
    });
    setPhase("loading");
    const res = await fetch("/api/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action: "generate" }),
    });
    const data: StepData = await res.json();
    setStep(data);
    setEditorCode(data.code);
    setPhase("explain");
  }

  async function verify() {
    if (!step) return;
    setPhase("verifying");
    const res = await fetch("/api/verify-challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        codeAfter: editorCode,
        challenge: step.challenge,
        challengeCheck: step.challenge_check,
      }),
    });
    const data = await res.json();
    setFeedback(data.feedback);
    if (data.passed) {
      setTimeout(() => {
        setFeedback(null);
        setPhase("teachback");
      }, 1200);
    } else {
      setPhase("challenge");
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      mediaRecRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setFeedback("I couldn't reach the microphone — check your browser's permission.");
    }
  }

  async function stopAndSubmitTeachback() {
    const rec = mediaRecRef.current;
    if (!rec) return;
    setRecording(false);
    const blob: Blob = await new Promise((resolve) => {
      rec.onstop = () => {
        rec.stream.getTracks().forEach((t) => t.stop());
        resolve(new Blob(chunksRef.current, { type: "audio/webm" }));
      };
      rec.stop();
    });

    setPhase("grading");
    const fd = new FormData();
    fd.append("token", token);
    fd.append("audio", blob, "teachback.webm");
    const res = await fetch("/api/teachback", { method: "POST", body: fd });
    const data = await res.json();
    setGrade(data.grade ?? null);
    setFeedback(data.feedback);

    setTimeout(() => {
      if (data.done) {
        setPhase("done");
      } else {
        setPrediction("");
        setStep(null);
        setFeedback(null);
        setGrade(null);
        setState((s) => (s ? { ...s, currentStep: data.nextStep } : s));
        setPhase("predict");
      }
    }, 2400);
  }

  if (notFound)
    return (
      <Centered>
        <h1 style={{ fontFamily: "Bricolage Grotesque", fontSize: 30 }}>BuildPath</h1>
        <p style={{ color: C.soft, marginTop: 8 }}>
          This workspace link isn&apos;t valid. Check the link BuildBot sent you on WhatsApp.
        </p>
      </Centered>
    );

  if (!state || phase === "loading")
    return (
      <Centered>
        <Spinner />
        <p style={{ color: C.soft, marginTop: 14 }}>
          {step ? "BuildBot is writing your code…" : "Opening your workspace…"}
        </p>
      </Centered>
    );

  if (phase === "done")
    return (
      <Centered>
        <div style={{ fontSize: 46 }}>🏆</div>
        <h1 style={{ fontFamily: "Bricolage Grotesque", fontSize: 32, marginTop: 8 }}>
          You built {state.title}!
        </h1>
        <p style={{ color: C.soft, marginTop: 8, maxWidth: 440 }}>
          Every step, every line — you understand how it works because you changed part of it
          yourself. Now show the person you built it for.
        </p>
        <div style={{ marginTop: 24, width: "100%", maxWidth: 360, height: 460 }}>
          <Preview code={editorCode} iframeRef={iframeRef} />
        </div>
      </Centered>
    );

  const total = state.plan?.steps.length || 0;
  const cur = state.currentStep;
  const goal = state.plan?.steps[cur - 1]?.goal || "";
  const stepTitle = state.plan?.steps[cur - 1]?.title || "";

  return (
    <div style={{ minHeight: "100vh", background: C.workbench }}>
      {/* top bar */}
      <div
        style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "13px 22px", borderBottom: `1px solid ${C.line}`, background: C.card,
        }}
      >
        <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: C.yellow, fontSize: 20 }}>🛠️</span> BuildPath
        </div>
        <div style={{ fontSize: 13, color: C.soft }}>
          Building: <b style={{ color: C.graphite }}>{state.title}</b>
        </div>
      </div>

      {/* progress dots */}
      <div style={{ display: "flex", gap: 5, padding: "12px 22px 0" }}>
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1, height: 6, borderRadius: 20,
              background: i + 1 < cur ? C.circuit : i + 1 === cur ? C.yellow : "#ece9e1",
            }}
          />
        ))}
      </div>

      <div
        style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20,
          padding: 22, alignItems: "start",
        }}
        className="ws-grid"
      >
        {/* LEFT: the conversation / step guide */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: C.yellowDeep }}>
            Step {cur} of {total}
          </div>
          <div style={{ fontFamily: "Bricolage Grotesque", fontSize: 22, fontWeight: 700, margin: "4px 0 14px" }}>
            {stepTitle}
          </div>

          {phase === "predict" && (
            <Card>
              <p style={{ fontSize: 15 }}>{goal}</p>
              <div style={{ background: C.violetBg, borderRadius: 10, padding: "12px 14px", margin: "14px 0", fontSize: 14, color: C.violet }}>
                ⚡ Before I write any code — <b>predict:</b> what do you think this feature needs to do?
              </div>
              <textarea
                value={prediction}
                onChange={(e) => setPrediction(e.target.value)}
                placeholder="Type what you think…"
                style={textareaStyle}
              />
              <button onClick={submitPrediction} disabled={!prediction.trim()} style={primaryBtn(!prediction.trim())}>
                Build it →
              </button>
            </Card>
          )}

          {(phase === "explain" || phase === "challenge" || phase === "verifying") && step && (
            <Card>
              <div style={{ background: C.circuitBg, borderRadius: 10, padding: "12px 14px", fontSize: 14, color: C.circuitDeep }}>
                <b>Here&apos;s what I built 👇</b>
                <p style={{ marginTop: 6, lineHeight: 1.55 }}>{step.explanation}</p>
              </div>

              {phase === "explain" && (
                <button onClick={() => setPhase("challenge")} style={primaryBtn(false)}>
                  Got it — my turn →
                </button>
              )}

              {(phase === "challenge" || phase === "verifying") && (
                <>
                  <div style={{ background: C.yellowBg, borderRadius: 10, padding: "12px 14px", margin: "14px 0", fontSize: 14, color: C.yellowDeep }}>
                    🎯 <b>Your turn:</b> {step.challenge}
                    <div style={{ marginTop: 6, fontSize: 12.5, opacity: 0.85 }}>
                      Edit the code on the right, then check your work.
                    </div>
                  </div>
                  {feedback && (
                    <div style={{ fontSize: 13.5, color: feedback.match(/right|nice|great|yes|done/i) ? C.circuitDeep : "#A32D2D", marginBottom: 10 }}>
                      {feedback}
                    </div>
                  )}
                  <button onClick={verify} disabled={phase === "verifying"} style={primaryBtn(phase === "verifying")}>
                    {phase === "verifying" ? "Checking your work…" : "Check my work ✓"}
                  </button>
                </>
              )}
            </Card>
          )}

          {(phase === "teachback" || phase === "grading") && step && (
            <Card>
              <div style={{ background: C.violetBg, borderRadius: 10, padding: "12px 14px", fontSize: 14, color: C.violet }}>
                🎤 <b>Last thing — teach it back.</b>
                <p style={{ marginTop: 6, lineHeight: 1.5 }}>
                  Record a short voice note explaining <b>why</b> this step mattered — like you&apos;re
                  teaching a friend. This is how the next step unlocks.
                </p>
              </div>

              {phase === "teachback" && !recording && (
                <button onClick={startRecording} style={primaryBtn(false)}>
                  ● Start recording
                </button>
              )}
              {phase === "teachback" && recording && (
                <button onClick={stopAndSubmitTeachback} style={{ ...primaryBtn(false), background: "#A32D2D" }}>
                  ■ Stop &amp; send
                </button>
              )}
              {phase === "grading" && (
                <div style={{ marginTop: 14, textAlign: "center" }}>
                  <Spinner />
                  <p style={{ color: C.soft, marginTop: 10, fontSize: 13 }}>Listening to your explanation…</p>
                </div>
              )}
              {feedback && grade !== null && (
                <div style={{ marginTop: 12, fontSize: 14, color: grade >= 2 ? C.circuitDeep : C.yellowDeep, lineHeight: 1.5 }}>
                  {grade >= 3 ? "🌟 " : grade === 2 ? "👍 " : "💡 "}{feedback}
                </div>
              )}
            </Card>
          )}
        </div>

        {/* RIGHT: live preview + code editor */}
        <div>
          <div style={{ fontSize: 12, color: C.soft, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
            📱 Your app — live preview
          </div>
          <Preview code={editorCode} iframeRef={iframeRef} />
          <div style={{ fontSize: 12, color: C.soft, margin: "14px 0 8px" }}>
            ✏️ Your code — edit it to do your challenge
          </div>
          <textarea
            value={editorCode}
            onChange={(e) => setEditorCode(e.target.value)}
            spellCheck={false}
            style={{
              width: "100%", height: 220, fontFamily: "monospace", fontSize: 12.5,
              padding: 12, borderRadius: 10, border: `1px solid ${C.line}`,
              background: "#0e1a14", color: "#cfe8db", lineHeight: 1.5, resize: "vertical",
            }}
          />
        </div>
      </div>

      <style>{`@media (max-width: 760px){ .ws-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

function Preview({ code, iframeRef }: { code: string; iframeRef: React.RefObject<HTMLIFrameElement | null> }) {
  return (
    <iframe
      ref={iframeRef}
      title="app preview"
      sandbox="allow-scripts"
      srcDoc={code}
      style={{
        width: "100%", height: 320, border: `2px solid ${C.line}`,
        borderRadius: 14, background: "#fff",
      }}
    />
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "16px 18px" }}>
      {children}
    </div>
  );
}
function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24, background: C.workbench }}>
      {children}
    </div>
  );
}
function Spinner() {
  return (
    <div style={{ width: 34, height: 34, border: `3px solid ${C.line}`, borderTopColor: C.yellow, borderRadius: "50%", animation: "spin 0.8s linear infinite" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

const textareaStyle: React.CSSProperties = {
  width: "100%", minHeight: 70, padding: 12, borderRadius: 10,
  border: `1px solid ${C.line}`, fontFamily: "inherit", fontSize: 14, resize: "vertical",
};
function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    marginTop: 14, width: "100%", padding: "12px", borderRadius: 10, border: "none",
    background: disabled ? "#cfccc4" : C.graphite, color: "#fff", fontWeight: 600,
    fontSize: 15, cursor: disabled ? "default" : "pointer", fontFamily: "inherit",
  };
}
