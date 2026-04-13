import { useState, useEffect, useRef } from "react";
import "./App.css";
import { supabase } from "./supabaseClient";
import Auth from "./Auth";
import Dashboard from "./Dashboard";

const SESSION_ID = crypto.randomUUID();

const COMPLETION_SIGNALS = ["best of luck", "speak with you", "review everything", "assessment"];

// ── API helpers ───────────────────────────────────────────────────────────────

const TIMEOUT_MS = 90_000;
const TIMEOUT_MSG = "Maya is waking up, please wait 30 seconds and try again.";

function withTimeout(signal) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  // Chain to any existing signal
  signal?.addEventListener("abort", () => controller.abort());
  return { signal: controller.signal, clear: () => clearTimeout(id) };
}

async function callChat(messages) {
  const { signal, clear } = withTimeout();
  try {
    const res = await fetch("https://ai-tutor-screener-backend.onrender.com/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: SESSION_ID, messages }),
      signal,
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(detail.detail || `Server error: ${res.status}`);
    }
    return (await res.json()).response;
  } catch (err) {
    if (err.name === "AbortError") throw new Error(TIMEOUT_MSG);
    throw err;
  } finally {
    clear();
  }
}

async function callTranscribe(blob) {
  const { signal, clear } = withTimeout();
  const formData = new FormData();
  formData.append("file", blob, "recording.webm");
  try {
    const res = await fetch("https://ai-tutor-screener-backend.onrender.com/transcribe", {
      method: "POST",
      body: formData,
      signal,
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(detail.detail || `Transcription error: ${res.status}`);
    }
    return (await res.json()).text;
  } catch (err) {
    if (err.name === "AbortError") throw new Error(TIMEOUT_MSG);
    throw err;
  } finally {
    clear();
  }
}

async function callSpeak(text) {
  const { signal, clear } = withTimeout();
  try {
    const res = await fetch("https://ai-tutor-screener-backend.onrender.com/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal,
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(detail.detail || `TTS error: ${res.status}`);
    }
    return await res.blob();
  } catch (err) {
    if (err.name === "AbortError") throw new Error(TIMEOUT_MSG);
    throw err;
  } finally {
    clear();
  }
}

async function callAssess(messages) {
  const { signal, clear } = withTimeout();
  try {
    const res = await fetch("https://ai-tutor-screener-backend.onrender.com/assess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
      signal,
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(detail.detail || `Assessment error: ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    if (err.name === "AbortError") throw new Error(TIMEOUT_MSG);
    throw err;
  } finally {
    clear();
  }
}

// ── TTS helpers ───────────────────────────────────────────────────────────────

function splitIntoChunks(text, maxLen = 500) {
  const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [text];
  const chunks = [];
  let current = "";
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    if ((current + " " + trimmed).trim().length > maxLen) {
      if (current) chunks.push(current.trim());
      if (trimmed.length > maxLen) {
        const words = trimmed.split(" ");
        let part = "";
        for (const word of words) {
          if ((part + " " + word).trim().length > maxLen) {
            if (part) chunks.push(part.trim());
            part = word;
          } else {
            part = (part + " " + word).trim();
          }
        }
        current = part;
      } else {
        current = trimmed;
      }
    } else {
      current = (current + " " + trimmed).trim();
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

function cleanTextForTTS(text) {
  return text
    .replace(/!/g, ".")
    .replace(/(\d+)-year-old/g, "$1 year old")
    .replace(/(\d+)-year-olds/g, "$1 year olds")
    .replace(/follow-up/gi, "follow up")
    .replace(/step-by-step/gi, "step by step")
    .replace(/well-known/gi, "well known")
    .replace(/long-term/gi, "long term")
    .replace(/-/g, " ");
}

// ── Assessment report helpers ─────────────────────────────────────────────────

const SCORE_LABELS = {
  communication_clarity: "Communication Clarity",
  warmth_and_patience: "Warmth & Patience",
  ability_to_simplify: "Ability to Simplify",
  handling_difficulty: "Handling Difficulty",
  english_fluency: "English Fluency",
};

function downloadReport(report) {
  const lines = [
    "CUEMATH TUTOR SCREENING REPORT",
    "=".repeat(40),
    "",
    `Candidate: ${report.candidate_name}`,
    `Recommendation: ${report.recommendation}`,
    `Reason: ${report.recommendation_reason}`,
    "",
    "SCORES",
    "-".repeat(40),
    ...Object.entries(report.scores).map(([key, val]) =>
      `${SCORE_LABELS[key] ?? key}: ${val.score}/5\n  Evidence: "${val.evidence}"`
    ),
    "",
    "OVERALL SUMMARY",
    "-".repeat(40),
    report.overall_summary,
    "",
    "STRENGTHS",
    "-".repeat(40),
    ...report.strengths.map((s) => `• ${s}`),
    "",
    "AREAS TO PROBE",
    "-".repeat(40),
    ...report.areas_to_probe.map((a) => `• ${a}`),
    "",
    "INTERVIEW QUALITY",
    "-".repeat(40),
    report.interview_quality,
    "",
    `Generated: ${new Date().toLocaleString()}`,
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cuemath-assessment-${report.candidate_name.replace(/\s+/g, "-").toLowerCase()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreBar({ score }) {
  return (
    <div className="score-bar-track">
      {[1, 2, 3, 4, 5].map((n) => (
        <div key={n} className={`score-bar-pip ${n <= score ? "score-bar-pip--filled" : ""}`} />
      ))}
    </div>
  );
}

function RecommendationBadge({ value }) {
  const cls = value === "SHORTLIST" ? "badge--green" : value === "REJECT" ? "badge--red" : "badge--yellow";
  return <span className={`badge ${cls}`}>{value}</span>;
}

function AssessmentReport({ report, onClose }) {
  return (
    <div className="report-overlay">
      <div className="report-panel">
        <div className="report-header">
          <div>
            <div className="report-candidate">{report.candidate_name}</div>
            <RecommendationBadge value={report.recommendation} />
          </div>
          <button className="report-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <p className="report-reason">{report.recommendation_reason}</p>

        <section className="report-section">
          <h3>Scores</h3>
          {Object.entries(report.scores).map(([key, val]) => (
            <div key={key} className="score-row">
              <div className="score-row-top">
                <span className="score-label">{SCORE_LABELS[key] ?? key}</span>
                <ScoreBar score={val.score} />
                <span className="score-num">{val.score}/5</span>
              </div>
              <blockquote className="score-evidence">"{val.evidence}"</blockquote>
            </div>
          ))}
        </section>

        <section className="report-section">
          <h3>Overall Summary</h3>
          <p className="report-text">{report.overall_summary}</p>
        </section>

        <section className="report-section">
          <h3>Strengths</h3>
          <ul className="report-list report-list--strengths">
            {report.strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </section>

        <section className="report-section">
          <h3>Areas to Probe</h3>
          <ul className="report-list report-list--probe">
            {report.areas_to_probe.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </section>

        <p className="report-quality">{report.interview_quality}</p>

        <button className="download-btn" onClick={() => downloadReport(report)}>
          Download Report
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const LOADING_MESSAGES = [
  "Connecting to Maya…",
  "Setting up your interview…",
  "Almost ready…",
];

function LoadingScreen({ elapsedMs }) {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setMsgIndex((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="loading-screen">
      <div className="loading-card">
        <div className="loading-logo">M</div>
        <p className="loading-message">{LOADING_MESSAGES[msgIndex]}</p>
        <div className="loading-dots">
          <span /><span /><span />
        </div>
        {elapsedMs > 15000 && (
          <p className="loading-hint">
            This may take a moment on first load —<br />our server is waking up.
          </p>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState("interview"); // "interview" | "dashboard"

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (!user) {
    return <Auth onLogin={setUser} />;
  }

  if (view === "dashboard") {
    return <Dashboard user={user} onNewInterview={() => setView("interview")} />;
  }

  return <Interview user={user} onShowDashboard={() => setView("dashboard")} />;
}

function extractCandidateName(messages) {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "Candidate";
  const text = firstUser.content;
  const match =
    text.match(/(?:i['']?m|my name is|this is|i am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i) ??
    text.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)[.,!]?\s/);
  return match?.[1]?.trim() ?? "Candidate";
}

function Interview({ user, onShowDashboard }) {
  const [started, setStarted]             = useState(false);
  const [loadingGreeting, setLoadingGreeting] = useState(false);
  const [greetingStartMs, setGreetingStartMs] = useState(0);
  const [elapsed, setElapsed]             = useState(0);
  const [messages, setMessages]           = useState([]);
  const [input, setInput]                 = useState("");
  const [waiting, setWaiting]             = useState(false);
  const [speaking, setSpeaking]           = useState(false);
  const [recording, setRecording]         = useState(false);
  const [transcribing, setTranscribing]   = useState(false);
  const [error, setError]                 = useState("");
  const [interviewState, setInterviewState] = useState("not_started"); // not_started | in_progress | completed
  const [assessing, setAssessing]         = useState(false);
  const [report, setReport]               = useState(null);

  const bottomRef        = useRef(null);
  const inputRef         = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef        = useRef([]);
  const autoSendTimer    = useRef(null);
  const audioRef         = useRef(null);
  const interviewIdRef   = useRef(null);

  // ── Supabase persistence ────────────────────────────────────────────────────

  async function saveInterview(msgs) {
    try {
      const { data, error } = await supabase
        .from("interviews")
        .insert({
          recruiter_id: user.id,
          candidate_name: extractCandidateName(msgs),
          status: "completed",
          completed_at: new Date().toISOString(),
          messages: msgs,
        })
        .select();
      if (error) throw error;
      interviewIdRef.current = data?.[0]?.id ?? null;
    } catch (err) {
      console.error("Failed to save interview:", err);
    }
  }

  async function saveAssessment(report) {
    try {
      const { error } = await supabase.from("assessments").insert({
        interview_id: interviewIdRef.current,
        recruiter_id: user.id,
        candidate_name: report.candidate_name,
        recommendation: report.recommendation,
        confidence_score: report.confidence_score ?? null,
        scores: report.scores,
        overall_summary: report.overall_summary,
        strengths: report.strengths,
        areas_to_probe: report.areas_to_probe,
        full_report: report,
      });
      if (error) throw error;
    } catch (err) {
      console.error("Failed to save assessment:", err);
    }
  }

  // ── TTS ────────────────────────────────────────────────────────────────────

  async function speakAndShow(displayText) {
    if (audioRef.current) {
      audioRef.current.pause();
    }

    // Ensure we have a persistent audio element (iOS requires reuse of the
    // same element that was unlocked in the user gesture)
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }

    setSpeaking(true);

    const chunks = splitIntoChunks(cleanTextForTTS(displayText));

    let blobs;
    try {
      blobs = await Promise.all(chunks.map(callSpeak));
    } catch (err) {
      console.error("TTS fetch error:", err.message);
      setMessages((prev) => [...prev, { role: "assistant", content: displayText }]);
      setSpeaking(false);
      return;
    }

    const urls = blobs.map((b) => URL.createObjectURL(b));
    const audio = audioRef.current;

    function playChunk(index) {
      if (index >= urls.length) {
        setSpeaking(false);
        return;
      }

      if (index === 0) {
        setMessages((prev) => [...prev, { role: "assistant", content: displayText }]);
      }

      audio.onended = () => {
        URL.revokeObjectURL(urls[index]);
        playChunk(index + 1);
      };
      audio.onerror = (e) => {
        console.error("Audio playback error on chunk", index, e);
        URL.revokeObjectURL(urls[index]);
        playChunk(index + 1);
      };

      audio.src = urls[index];
      audio.playbackRate = 1.05;
      audio.play().catch((playErr) => {
        console.warn("Autoplay blocked on chunk", index, playErr.message);
        setSpeaking(false);
      });
    }

    playChunk(0);
  }

  // ── Chat ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!loadingGreeting) return;
    const id = setInterval(() => {
      setElapsed(Date.now() - greetingStartMs);
    }, 500);
    return () => clearInterval(id);
  }, [loadingGreeting, greetingStartMs]);

  async function startInterview() {
    // Unlock iOS audio context synchronously inside the user gesture
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    audioRef.current.src =
      'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGFoYQQAAAAAAAA=';
    audioRef.current.play().catch(() => {});

    const startMs = Date.now();
    setGreetingStartMs(startMs);
    setLoadingGreeting(true);
    try {
      const reply = await callChat([]);
      setLoadingGreeting(false);
      setStarted(true);
      setInterviewState("in_progress");
      setWaiting(true);
      try {
        await speakAndShow(reply);
      } finally {
        setWaiting(false);
      }
    } catch (err) {
      setLoadingGreeting(false);
      setStarted(false);
      setError(err.message);
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, waiting, speaking]);

  useEffect(() => {
    if (!waiting && !speaking) inputRef.current?.focus();
  }, [waiting, speaking]);

  // Detect interview completion from Maya's closing message
  useEffect(() => {
    if (interviewState !== "in_progress" || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role !== "assistant") return;
    const lower = last.content.toLowerCase();
    if (COMPLETION_SIGNALS.some((sig) => lower.includes(sig))) {
      setInterviewState("completed");
      saveInterview(messages);
    }
  }, [messages, interviewState]);

  async function send(textOverride) {
    const text = (textOverride ?? input).trim();
    if (!text || waiting || speaking) return;

    const updated = [...messages, { role: "user", content: text }];
    setMessages(updated);
    setInput("");
    setError("");
    setWaiting(true);

    try {
      const reply = await callChat(updated);
      await speakAndShow(reply);
    } catch (err) {
      setError(err.message || "Something went wrong. Is the backend running?");
    } finally {
      setWaiting(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  // ── Recording ──────────────────────────────────────────────────────────────

  async function startRecording() {
    setError("");
    chunksRef.current = [];

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access denied. Please allow microphone access and try again.");
      return;
    }

    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      setTranscribing(true);
      try {
        const transcribed = await callTranscribe(blob);
        setInput(transcribed);
        autoSendTimer.current = setTimeout(() => send(transcribed), 1500);
      } catch (err) {
        setError(err.message);
      } finally {
        setTranscribing(false);
      }
    };

    recorder.start();
    setRecording(true);
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  function toggleMic() {
    if (recording) stopRecording();
    else startRecording();
  }

  function handleInputChange(e) {
    clearTimeout(autoSendTimer.current);
    setInput(e.target.value);
  }

  // ── Assessment ─────────────────────────────────────────────────────────────

  async function viewAssessment() {
    setAssessing(true);
    setError("");
    try {
      const result = await callAssess(messages);
      setReport(result);
      saveAssessment(result);
    } catch (err) {
      setError(err.message || "Failed to generate assessment.");
    } finally {
      setAssessing(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const micDisabled = waiting || speaking || transcribing || interviewState === "completed";

  if (loadingGreeting) {
    return <LoadingScreen elapsedMs={elapsed} />;
  }

  if (!started) {
    return (
      <div className="start-screen">
        <div className="start-card">
          <div className="start-logo">M</div>
          <p className="start-powered">Powered by Cuemath</p>
          <h1 className="start-title">AI Tutor Screener</h1>
          <p className="start-desc">
            You'll speak with Maya, our AI interviewer, in a short 5-minute voice screening.<br />
            Answer naturally — Maya will ask 4–5 questions and assess your teaching approach.
          </p>
          {error && <p className="start-error">{error}</p>}
          <button className="start-btn" onClick={startInterview}>
            Start Interview
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="chat-shell">
        <header className="chat-header">
          <div className="header-avatar">M</div>
          <div className="header-text">
            <div className="header-name">Maya <span className="header-brand">· Cuemath</span></div>
            <div className="header-sub">
              {speaking ? "Maya is speaking…" : "AI Interview Assistant"}
            </div>
          </div>
          <div className="header-right">
            <div className="header-status-dot" title={speaking ? "Speaking" : "Ready"} />
            {interviewState !== "in_progress" && (
              <button className="dashboard-btn" onClick={onShowDashboard}>Dashboard</button>
            )}
            <button className="logout-btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
          </div>
        </header>

        <div className="chat-messages">
          {messages.map((msg, i) =>
            msg.role === "assistant" ? (
              <div key={i} className="row row-maya">
                <div className="bubble-wrap">
                  <span className="sender-label">Maya</span>
                  <div className="bubble bubble-maya">{msg.content}</div>
                </div>
              </div>
            ) : (
              <div key={i} className="row row-user">
                <div className="bubble bubble-user">{msg.content}</div>
              </div>
            )
          )}

          {(waiting || transcribing) && (
            <div className="row row-maya">
              <div className="bubble-wrap">
                <span className="sender-label">Maya</span>
                <div className="bubble bubble-maya typing-indicator">
                  <span /><span /><span />
                </div>
              </div>
            </div>
          )}

          {error && <p className="chat-error">{error}</p>}
          <div ref={bottomRef} />
        </div>

        {interviewState === "completed" ? (
          <div className="completion-bar">
            <p className="completion-msg">Interview complete.</p>
            <button
              className="assess-btn"
              onClick={viewAssessment}
              disabled={assessing}
            >
              {assessing ? "Generating assessment…" : "View Assessment Report"}
            </button>
          </div>
        ) : (
          <>
            <div className="mic-row">
              <button
                className={`mic-btn ${recording ? "mic-btn--recording" : ""}`}
                onClick={toggleMic}
                disabled={micDisabled}
                aria-label={recording ? "Stop recording" : "Start recording"}
                title={speaking ? "Wait for Maya to finish speaking" : recording ? "Stop recording" : "Speak your answer"}
              >
                {recording ? (
                  <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26">
                    <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-1 17.93V21H9v2h6v-2h-2v-2.07A8.001 8.001 0 0 0 20 11h-2a6 6 0 0 1-12 0H4a8.001 8.001 0 0 0 7 7.93z"/>
                  </svg>
                )}
              </button>
              {transcribing && <span className="mic-status">Transcribing…</span>}
              {recording    && <span className="mic-status mic-status--recording">Recording…</span>}
              {speaking     && <span className="mic-status">Maya is speaking…</span>}
            </div>

            <div className="chat-input-bar">
              <textarea
                ref={inputRef}
                className="chat-input"
                rows={1}
                placeholder="Or type your answer…"
                value={input}
                disabled={waiting || speaking}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
              />
              <button
                className="send-btn"
                onClick={() => send()}
                disabled={waiting || speaking || !input.trim()}
              >
                Send
              </button>
            </div>
          </>
        )}
      </div>

      {report && <AssessmentReport report={report} onClose={() => setReport(null)} />}
    </>
  );
}
