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
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Photo state is separate from `form`: photoFile is a newly-picked file
  // pending upload, photoPreviewUrl is what to show (either that file's
  // local preview or an existing reward's already-uploaded photo), and
  // photoRemoved distinguishes "leave the existing photo alone" (editing,
  // untouched) from "explicitly clear it" (editing, removed) — both look
  // like "no photoFile" otherwise.
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);

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
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    setPhotoRemoved(false);
  };

  const startEdit = (reward) => {
    setForm({
      title: reward.title,
      points_cost: String(reward.points_cost),
      active: reward.active,
    });
    setEditingId(reward.id);
    setError(null);
    setPhotoFile(null);
    setPhotoPreviewUrl(reward.photo_url ?? null);
    setPhotoRemoved(false);
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
    setPhotoRemoved(false);
  };

  const removePhoto = () => {
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    setPhotoRemoved(true);
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

    try {
      let photoUrl;
      if (photoFile) {
        setUploadingPhoto(true);
        const ext = photoFile.name.split(".").pop() || "jpg";
        const path = `${staffRow.restaurant_id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("reward-photos")
          .upload(path, photoFile, { contentType: photoFile.type || "image/jpeg" });
        if (uploadError) throw uploadError;
        const { data: publicUrlData } = supabase.storage.from("reward-photos").getPublicUrl(path);
        photoUrl = publicUrlData.publicUrl;
        setUploadingPhoto(false);
      } else if (photoRemoved) {
        photoUrl = null;
      }
      // else: leave whatever photo_url the row already has untouched

      const payload = {
        title: form.title.trim(),
        points_cost: cost,
        active: form.active,
        ...(photoUrl !== undefined ? { photo_url: photoUrl } : {}),
      };

      if (editingId) {
        const { error } = await supabase.from("redeemable_rewards").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("redeemable_rewards")
          .insert({ restaurant_id: staffRow.restaurant_id, ...payload });
        if (error) throw error;
      }

      if (staffRow) await loadRewards(staffRow.restaurant_id);
      resetForm();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingPhoto(false);
      setBusy(false);
    }
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
      <h3 className="section-title">{editingId ? "Edit Reward" : "Add New Reward"}</h3>
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
        <div className="reward-photo-row">
          <label className="reward-photo-picker">
            <div className="reward-photo-circle">
              {photoPreviewUrl ? (
                <img src={photoPreviewUrl} alt="Reward preview" className="reward-photo-preview" />
              ) : (
                <span className="reward-photo-placeholder-text">📷</span>
              )}
            </div>
            <input type="file" accept="image/*" onChange={handlePhotoChange} hidden />
          </label>
          <div className="reward-photo-hint">
            <span className="hint-text">Photo (optional) — shown as a small icon next to the reward</span>
            {photoPreviewUrl && (
              <button type="button" className="link-button" onClick={removePhoto}>
                Remove photo
              </button>
            )}
          </div>
        </div>
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
            {uploadingPhoto ? "Uploading photo…" : busy ? "Saving…" : editingId ? "Save changes" : "Add reward"}
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
              <div className="reward-list-thumb">
                {reward.photo_url ? (
                  <img src={reward.photo_url} alt="" />
                ) : (
                  <span className="reward-photo-placeholder-text">📷</span>
                )}
              </div>
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