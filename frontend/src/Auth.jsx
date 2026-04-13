import { useState } from "react";
import { supabase } from "./supabaseClient";

export default function Auth({ onLogin }) {
  const [tab, setTab]       = useState("signin"); // "signin" | "signup"
  const [email, setEmail]   = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [info, setInfo]         = useState("");

  async function handleSignIn(e) {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) { setError(err.message); return; }
    onLogin(data.user);
  }

  async function handleSignUp(e) {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    const { error: err } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setInfo("Check your email to confirm your account, then sign in.");
    setTab("signin");
  }

  function switchTab(t) {
    setTab(t);
    setError("");
    setInfo("");
  }

  const isSignIn = tab === "signin";

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">M</div>
        <h1 className="auth-title">AI Tutor Screener</h1>
        <p className="auth-powered">Powered by Cuemath</p>

        <div className="auth-tabs">
          <button
            className={`auth-tab ${isSignIn ? "auth-tab--active" : ""}`}
            onClick={() => switchTab("signin")}
            type="button"
          >
            Sign In
          </button>
          <button
            className={`auth-tab ${!isSignIn ? "auth-tab--active" : ""}`}
            onClick={() => switchTab("signup")}
            type="button"
          >
            Sign Up
          </button>
        </div>

        <form className="auth-form" onSubmit={isSignIn ? handleSignIn : handleSignUp}>
          <label className="auth-label" htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            className="auth-input"
            type="email"
            autoComplete="email"
            placeholder="recruiter@cuemath.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label className="auth-label" htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            className="auth-input"
            type="password"
            autoComplete={isSignIn ? "current-password" : "new-password"}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && <p className="auth-error">{error}</p>}
          {info  && <p className="auth-info">{info}</p>}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? "Please wait…" : isSignIn ? "Sign In" : "Sign Up"}
          </button>
        </form>
      </div>
    </div>
  );
}
