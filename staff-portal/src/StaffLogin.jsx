import { useState } from "react";
import { supabase } from "./supabase.js";

export function StaffLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>Staff login</h2>
      <input
        type="email"
        placeholder="Work email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error && <p className="error-text">{error}</p>}
      <button type="submit" disabled={busy}>
        {busy ? "Logging in…" : "Log in"}
      </button>
      <p className="hint-text">
        Staff accounts are created in the admin dashboard, not self-signup.
      </p>
    </form>
  );
}
