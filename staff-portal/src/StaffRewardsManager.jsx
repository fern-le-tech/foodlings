import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";
import { supabase } from "./supabase.js";

const SCANNER_ELEMENT_ID = "reward-qr-reader";
const emptyForm = { title: "", points_cost: "", active: true };

async function safeStop(scanner) {
  if (scanner && scanner.getState() === Html5QrcodeScannerState.SCANNING) {
    await scanner.stop().catch(() => {});
  }
}

export function StaffRewardsManager({ session }) {
  const [staffRow, setStaffRow] = useState(null);
  const [rewards, setRewards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Reward-code scanning
  const [scanning, setScanning] = useState(false);
  const [redeemResult, setRedeemResult] = useState(null);
  const [scanError, setScanError] = useState(null);
  const scannerRef = useRef(null);

  const loadRewards = async (restaurantId) => {
    const { data } = await supabase
      .from("redeemable_rewards")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("points_cost", { ascending: true });
    setRewards(data ?? []);
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("staff")
        .select("*, restaurants(name)")
        .eq("id", session.user.id)
        .single();
      setStaffRow(data);
      if (data) await loadRewards(data.restaurant_id);
      setLoading(false);
    })();
  }, [session.user.id]);

  // --- Scan & confirm a customer's pending redemption ---

  const startScan = () => {
    setScanError(null);
    setRedeemResult(null);
    setScanning(true);
  };

  useEffect(() => {
    if (!scanning) return;

    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
    scannerRef.current = scanner;
    let cancelled = false;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 240 },
        async (decodedText) => {
          if (cancelled) return;
          cancelled = true;
          await safeStop(scanner);
          setScanning(false);
          resolveRedemption(decodedText);
        },
        () => {}
      )
      .catch((err) => {
        setScanError("Camera access failed: " + err.message);
        setScanning(false);
      });

    return () => {
      cancelled = true;
      safeStop(scanner);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  const stopScan = async () => {
    await safeStop(scannerRef.current);
    setScanning(false);
  };

  const resolveRedemption = async (redemptionId) => {
    if (!staffRow) return;
    setBusy(true);
    setScanError(null);
    const { data, error } = await supabase.rpc("fulfill_redemption", {
      p_redemption_id: redemptionId,
      p_staff_id: session.user.id,
      p_restaurant_id: staffRow.restaurant_id,
    });
    if (error) {
      setScanError(error.message);
    } else {
      setRedeemResult(data?.[0] ?? null);
    }
    setBusy(false);
  };

  const resetScan = () => {
    setRedeemResult(null);
    setScanError(null);
  };

  // --- Manage rewards (add / edit / activate / delete) ---

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setError(null);
  };

  const startEdit = (reward) => {
    setForm({
      title: reward.title,
      points_cost: String(reward.points_cost),
      active: reward.active,
    });
    setEditingId(reward.id);
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!staffRow) return;

    const cost = parseInt(form.points_cost, 10);
    if (!form.title.trim()) {
      setError("Give the reward a name.");
      return;
    }
    if (Number.isNaN(cost) || cost <= 0) {
      setError("Points cost must be a positive number.");
      return;
    }

    setBusy(true);
    setError(null);

    if (editingId) {
      const { error } = await supabase
        .from("redeemable_rewards")
        .update({ title: form.title.trim(), points_cost: cost, active: form.active })
        .eq("id", editingId);
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.from("redeemable_rewards").insert({
        restaurant_id: staffRow.restaurant_id,
        title: form.title.trim(),
        points_cost: cost,
        active: form.active,
      });
      if (error) setError(error.message);
    }

    if (staffRow) await loadRewards(staffRow.restaurant_id);
    setBusy(false);
    if (!error) resetForm();
  };

  const toggleActive = async (reward) => {
    setBusy(true);
    const { error } = await supabase
      .from("redeemable_rewards")
      .update({ active: !reward.active })
      .eq("id", reward.id);
    if (error) setError(error.message);
    if (staffRow) await loadRewards(staffRow.restaurant_id);
    setBusy(false);
  };

  const deleteReward = async (reward) => {
    if (!window.confirm(`Delete "${reward.title}"? This can't be undone.`)) return;
    setBusy(true);
    const { error } = await supabase.from("redeemable_rewards").delete().eq("id", reward.id);
    if (error) setError(error.message);
    if (staffRow) await loadRewards(staffRow.restaurant_id);
    setBusy(false);
    if (editingId === reward.id) resetForm();
  };

  if (loading) return <p className="hint-text">Loading rewards…</p>;
  if (!staffRow) return <p className="hint-text">No staff profile found for this account.</p>;

  return (
    <div className="card">
      <h2>{staffRow.restaurants?.name} — Rewards</h2>

      {/* Scan & confirm a customer's redemption */}
      {!scanning && !redeemResult && (
        <div className="button-row">
          <button onClick={startScan}>Scan reward code</button>
        </div>
      )}

      {scanning && (
        <>
          <div id={SCANNER_ELEMENT_ID} className="qr-reader" />
          <button className="link-button" onClick={stopScan}>
            Cancel
          </button>
        </>
      )}

      {redeemResult && (
        <div>
          <p className={redeemResult.success ? "success-line" : "error-text"}>
            {redeemResult.success
              ? `Confirmed: ${redeemResult.reward_title} (${redeemResult.points_spent} pts spent)`
              : redeemResult.message}
          </p>
          <button onClick={resetScan}>Scan next</button>
        </div>
      )}

      {scanError && <p className="error-text">{scanError}</p>}

      <hr className="section-divider" />

      {/* Add / edit rewards */}
      <form onSubmit={handleSubmit} className="admin-form">
        <input
          type="text"
          placeholder="Reward name (e.g. Free garlic knots)"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          required
        />
        <input
          type="number"
          min="1"
          step="1"
          placeholder="Points cost"
          value={form.points_cost}
          onChange={(e) => setForm((f) => ({ ...f, points_cost: e.target.value }))}
          required
        />
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
          />
          Active (visible to customers)
        </label>
        <div className="button-row">
          <button type="submit" disabled={busy}>
            {editingId ? "Save changes" : "Add reward"}
          </button>
          {editingId && (
            <button type="button" className="link-button" onClick={resetForm}>
              Cancel edit
            </button>
          )}
        </div>
      </form>

      {error && <p className="error-text">{error}</p>}

      <div className="admin-list">
        {rewards.length === 0 ? (
          <p className="hint-text">No rewards yet — add one above.</p>
        ) : (
          rewards.map((reward) => (
            <div key={reward.id} className="admin-list-row">
              <div className="admin-list-row-col">
                <strong>{reward.title}</strong>
                <span className="hint-text">
                  {reward.points_cost} pts · {reward.active ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="button-row">
                <button type="button" onClick={() => startEdit(reward)}>
                  Edit
                </button>
                <button type="button" className="link-button" onClick={() => toggleActive(reward)}>
                  {reward.active ? "Deactivate" : "Activate"}
                </button>
                <button type="button" className="link-button" onClick={() => deleteReward(reward)}>
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}