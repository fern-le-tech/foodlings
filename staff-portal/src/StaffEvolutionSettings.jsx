import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";

export function StaffEvolutionSettings({ session }) {
  const [staffRow, setStaffRow] = useState(null);
  const [character, setCharacter] = useState(null);
  const [loading, setLoading] = useState(true);

  const [stage2Input, setStage2Input] = useState("");
  const [stage3Input, setStage3Input] = useState("");
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadCharacter = async (restaurantId) => {
    const { data } = await supabase
      .from("foodiemon_characters")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .single();
    setCharacter(data);
    if (data) {
      setStage2Input(String(data.xp_threshold_stage2));
      setStage3Input(String(data.xp_threshold_stage3));
    }
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("staff")
        .select("*, restaurants(name)")
        .eq("id", session.user.id)
        .single();
      setStaffRow(data);
      if (data) await loadCharacter(data.restaurant_id);
      setLoading(false);
    })();
  }, [session.user.id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const stage2 = parseInt(stage2Input, 10);
    const stage3 = parseInt(stage3Input, 10);

    if (Number.isNaN(stage2) || stage2 <= 0) {
      setError("Stage 2 threshold must be a positive number.");
      return;
    }
    if (Number.isNaN(stage3) || stage3 <= stage2) {
      setError("Stage 3 threshold must be greater than the stage 2 threshold.");
      return;
    }

    setBusy(true);
    const { data, error: rpcError } = await supabase.rpc("update_xp_thresholds", {
      p_xp_threshold_stage2: stage2,
      p_xp_threshold_stage3: stage3,
    });

    if (rpcError) {
      setError(rpcError.message);
    } else {
      setCharacter(data);
      setSaved(true);
    }
    setBusy(false);
  };

  if (loading) return <p className="hint-text">Loading evolution settings…</p>;
  if (!staffRow) return <p className="hint-text">No staff profile found for this account.</p>;
  if (!character) return <p className="hint-text">No character found for your restaurant yet.</p>;

  return (
    <div className="card">
      <h2>{staffRow.restaurants?.name} — Evolution Settings</h2>
      <p className="hint-text">
        Set how much XP a customer needs at your restaurant to evolve their Foodiemon. Stage 1 always starts at 0
        XP; you control the thresholds for stages 2 and 3.
      </p>

      <form onSubmit={handleSubmit} className="admin-form">
        <label className="checkbox-row">
          <span style={{ minWidth: 160, display: "inline-block" }}>
            {character.name_stage1} → {character.name_stage2}
          </span>
          <input
            type="number"
            min="1"
            step="1"
            value={stage2Input}
            onChange={(e) => setStage2Input(e.target.value)}
            placeholder="XP for stage 2"
            required
          />
          <span className="hint-text">XP</span>
        </label>

        <label className="checkbox-row">
          <span style={{ minWidth: 160, display: "inline-block" }}>
            {character.name_stage2} → {character.name_stage3}
          </span>
          <input
            type="number"
            min="1"
            step="1"
            value={stage3Input}
            onChange={(e) => setStage3Input(e.target.value)}
            placeholder="XP for stage 3"
            required
          />
          <span className="hint-text">XP</span>
        </label>

        <div className="button-row">
          <button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save thresholds"}
          </button>
        </div>
      </form>

      {error && <p className="error-text">{error}</p>}
      {saved && <p className="success-line">Evolution thresholds updated.</p>}
    </div>
  );
}