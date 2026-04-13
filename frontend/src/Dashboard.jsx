import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";

const SCORE_LABELS = {
  communication_clarity: "Communication Clarity",
  warmth_and_patience: "Warmth & Patience",
  ability_to_simplify: "Ability to Simplify",
  handling_difficulty: "Handling Difficulty",
  english_fluency: "English Fluency",
};

function avgScore(scores) {
  if (!scores) return null;
  const vals = Object.values(scores).map((v) => v?.score ?? 0);
  if (!vals.length) return null;
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
}

function RecommendationBadge({ value }) {
  const cls =
    value === "SHORTLIST" ? "badge--green" : value === "REJECT" ? "badge--red" : "badge--yellow";
  return <span className={`badge ${cls}`}>{value}</span>;
}

function ScoreBar({ score }) {
  return (
    <div className="score-bar-track">
      {[1, 2, 3, 4, 5].map((n) => (
        <div key={n} className={`score-bar-pip ${n <= score ? "score-bar-pip--filled" : ""}`} />
      ))}
    </div>
  );
}

function AssessmentCard({ item }) {
  const [expanded, setExpanded] = useState(false);
  const cardRef = useRef(null);
  const avg = avgScore(item.scores);
  const date = new Date(item.created_at).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });

  function toggleExpanded() {
    const opening = !expanded;
    setExpanded(opening);
    if (opening) {
      setTimeout(() => {
        cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  }

  return (
    <div className="dash-card" ref={cardRef}>
      <div className="dash-card-header" onClick={toggleExpanded}>
        <div className="dash-card-left">
          <div className="dash-candidate">{item.candidate_name}</div>
          <div className="dash-date">{date}</div>
        </div>
        <div className="dash-card-right">
          <RecommendationBadge value={item.recommendation} />
          {avg && <span className="dash-avg">{avg}<span className="dash-avg-denom">/5</span></span>}
          <span className="dash-chevron">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {expanded && (
        <div className="dash-card-body">
          {item.overall_summary && (
            <p className="dash-summary">{item.overall_summary}</p>
          )}

          {item.scores && (
            <div className="dash-scores">
              {Object.entries(item.scores).map(([key, val]) => (
                <div key={key} className="score-row">
                  <div className="score-row-top">
                    <span className="score-label">{SCORE_LABELS[key] ?? key}</span>
                    <ScoreBar score={val.score} />
                    <span className="score-num">{val.score}/5</span>
                  </div>
                  {val.evidence && (
                    <blockquote className="score-evidence">"{val.evidence}"</blockquote>
                  )}
                </div>
              ))}
            </div>
          )}

          {item.strengths?.length > 0 && (
            <div className="dash-section">
              <div className="dash-section-title">Strengths</div>
              <ul className="report-list report-list--strengths">
                {item.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}

          {item.areas_to_probe?.length > 0 && (
            <div className="dash-section">
              <div className="dash-section-title">Areas to Probe</div>
              <ul className="report-list report-list--probe">
                {item.areas_to_probe.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Dashboard({ user, onNewInterview }) {
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const { data, error: err } = await supabase
        .from("assessments")
        .select("*")
        .eq("recruiter_id", user.id)
        .order("created_at", { ascending: false });
      if (err) setError(err.message);
      else setAssessments(data ?? []);
      setLoading(false);
    }
    load();
  }, [user.id]);

  return (
    <div className="dash-shell">
      <header className="dash-header">
        <div className="dash-header-left">
          <div className="header-avatar">M</div>
          <div className="header-text">
            <div className="header-name">Dashboard <span className="header-brand">· Cuemath</span></div>
            <div className="header-sub">Past interviews</div>
          </div>
        </div>
        <div className="header-right">
          <button className="dashboard-btn" onClick={onNewInterview}>New Interview</button>
          <button className="logout-btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </header>

      <div className="dash-content">
        {loading && <p className="dash-loading">Loading…</p>}
        {error   && <p className="dash-error">{error}</p>}

        {!loading && !error && assessments.length === 0 && (
          <div className="dash-empty">
            <div className="dash-empty-icon">📋</div>
            <p>No interviews yet.</p>
            <p className="dash-empty-sub">Start your first interview to see results here.</p>
            <button className="start-btn" onClick={onNewInterview}>Start Interview</button>
          </div>
        )}

        {assessments.map((item) => (
          <AssessmentCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
