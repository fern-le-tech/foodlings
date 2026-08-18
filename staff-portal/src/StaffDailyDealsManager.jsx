import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";

const emptyForm = { description: "", expiresAt: "" };

// Default expiration suggestion: end of today, local time, formatted for
// an <input type="datetime-local"> value (YYYY-MM-DDTHH:mm).
function defaultExpiresAt() {
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return `${endOfToday.getFullYear()}-${pad(endOfToday.getMonth() + 1)}-${pad(endOfToday.getDate())}T${pad(
    endOfToday.getHours()
  )}:${pad(endOfToday.getMinutes())}`;
}

function timeRemainingLabel(expiresAt) {
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return "Expired";
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours >= 1) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

export function StaffDailyDealsManager({ session }) {
  const [staffRow, setStaffRow] = useState(null);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({ ...emptyForm, expiresAt: defaultExpiresAt() });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const loadDeals = async (restaurantId) => {
    const { data } = await supabase
      .from("daily_deals")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false });
    setDeals(data ?? []);
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("staff")
        .select("*, restaurants(name)")
        .eq("id", session.user.id)
        .single();
      setStaffRow(data);
      if (data) await loadDeals(data.restaurant_id);
      setLoading(false);
    })();
  }, [session.user.id]);

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
  };

  const resetForm = () => {
    setForm({ ...emptyForm, expiresAt: defaultExpiresAt() });
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!staffRow) return;

    if (!photoFile) {
      setError("Add a photo for the deal.");
      return;
    }
    if (!form.description.trim()) {
      setError("Describe the deal.");
      return;
    }
    if (!form.expiresAt) {
      setError("Set when this deal ends.");
      return;
    }
    const expiresAtIso = new Date(form.expiresAt).toISOString();
    if (new Date(expiresAtIso).getTime() <= Date.now()) {
      setError("Expiration time has to be in the future.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      setUploadingPhoto(true);
      const ext = photoFile.name.split(".").pop() || "jpg";
      const path = `${staffRow.restaurant_id}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("daily-deal-photos")
        .upload(path, photoFile, { contentType: photoFile.type || "image/jpeg" });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from("daily-deal-photos").getPublicUrl(path);
      setUploadingPhoto(false);

      const { error: insertError } = await supabase.from("daily_deals").insert({
        restaurant_id: staffRow.restaurant_id,
        photo_url: publicUrlData.publicUrl,
        description: form.description.trim(),
        expires_at: expiresAtIso,
        created_by: session.user.id,
        active: true,
      });
      if (insertError) throw insertError;

      await loadDeals(staffRow.restaurant_id);
      resetForm();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingPhoto(false);
      setBusy(false);
    }
  };

  const endDealEarly = async (deal) => {
    if (!window.confirm("End this deal now? It'll stop showing to customers immediately.")) return;
    setBusy(true);
    const { error } = await supabase.from("daily_deals").update({ active: false }).eq("id", deal.id);
    if (error) setError(error.message);
    if (staffRow) await loadDeals(staffRow.restaurant_id);
    setBusy(false);
  };

  const deleteDeal = async (deal) => {
    if (!window.confirm("Delete this deal permanently? This can't be undone.")) return;
    setBusy(true);
    const { error } = await supabase.from("daily_deals").delete().eq("id", deal.id);
    if (error) setError(error.message);
    if (staffRow) await loadDeals(staffRow.restaurant_id);
    setBusy(false);
  };

  if (loading) return <p className="hint-text">Loading daily deals…</p>;
  if (!staffRow) return <p className="hint-text">No staff profile found for this account.</p>;

  const liveDeals = deals.filter((d) => d.active && new Date(d.expires_at).getTime() > Date.now());
  const pastDeals = deals.filter((d) => !d.active || new Date(d.expires_at).getTime() <= Date.now());

  return (
    <div className="card">
      <h2>{staffRow.restaurants?.name} — Daily Deals</h2>
      <p className="hint-text">
        Post a deal and it shows up instantly on the Home tab of the FoodieMon app for every customer.
      </p>

      <form onSubmit={handleSubmit} className="admin-form">
        <label className="deal-photo-picker">
          {photoPreviewUrl ? (
            <img src={photoPreviewUrl} alt="Deal preview" className="deal-photo-preview" />
          ) : (
            <div className="deal-photo-placeholder">
              <span>📷 Click to add a high-res photo</span>
            </div>
          )}
          <input type="file" accept="image/*" onChange={handlePhotoChange} hidden />
        </label>

        <textarea
          placeholder="Describe the deal (e.g. 20% off all entrees, 4–6pm today)"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={3}
          required
        />

        <label className="deal-expiry-row">
          <span>Deal ends</span>
          <input
            type="datetime-local"
            value={form.expiresAt}
            onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
            required
          />
        </label>

        <div className="button-row">
          <button type="submit" disabled={busy}>
            {uploadingPhoto ? "Uploading photo…" : busy ? "Posting…" : "Post daily deal"}
          </button>
        </div>
      </form>

      {error && <p className="error-text">{error}</p>}

      <hr className="section-divider" />

      <h3>Live now</h3>
      <div className="deal-grid">
        {liveDeals.length === 0 ? (
          <p className="hint-text">No live deals — post one above.</p>
        ) : (
          liveDeals.map((deal) => (
            <div key={deal.id} className="deal-card">
              <img src={deal.photo_url} alt="" className="deal-card-photo" />
              <div className="deal-card-body">
                <span className="deal-card-timer">{timeRemainingLabel(deal.expires_at)}</span>
                <p className="deal-card-description">{deal.description}</p>
                <div className="button-row">
                  <button type="button" className="link-button" onClick={() => endDealEarly(deal)}>
                    End early
                  </button>
                  <button type="button" className="link-button" onClick={() => deleteDeal(deal)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {pastDeals.length > 0 && (
        <>
          <h3>Past deals</h3>
          <div className="admin-list">
            {pastDeals.map((deal) => (
              <div key={deal.id} className="admin-list-row">
                <div className="admin-list-row-col">
                  <strong>{deal.description}</strong>
                  <span className="hint-text">
                    {deal.active ? "Expired" : "Ended early"} ·{" "}
                    {new Date(deal.expires_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="button-row">
                  <button type="button" className="link-button" onClick={() => deleteDeal(deal)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
