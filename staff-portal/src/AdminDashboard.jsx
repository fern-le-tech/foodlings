import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";

const TABS = ["Overview", "Add New Partner", "Manage Existing", "Staff"];

export function AdminDashboard() {
  const [tab, setTab] = useState("Overview");

  return (
    <div className="card">
      <div className="tab-row">
        {TABS.map((t) => (
          <button
            key={t}
            className={t === tab ? "tab-active" : "tab-button"}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Overview" && <OverviewPanel />}
      {tab === "Add New Partner" && <NewPartnerPanel onCreated={() => setTab("Manage Existing")} />}
      {tab === "Manage Existing" && <ManageExistingPanel />}
      {tab === "Staff" && <StaffPanel />}
    </div>
  );
}

/* ---------------- Overview (active restaurants, check-ins, revenue) ---------------- */

function formatCurrency(n) {
  return `$${Number(n).toFixed(2)}`;
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function todayISO() {
  return toISODate(new Date());
}

function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toISODate(d);
}

function startOfMonthISO() {
  const d = new Date();
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}

function OverviewPanel() {
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [activeCount, setActiveCount] = useState(0);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);

    const [{ data: restaurants, error: restaurantsError }, { data: report, error: reportError }] =
      await Promise.all([
        supabase.from("restaurants").select("id, partner_status"),
        supabase.rpc("admin_revenue_report", { p_start_date: startDate, p_end_date: endDate }),
      ]);

    if (restaurantsError || reportError) {
      setError((restaurantsError ?? reportError).message);
      setLoading(false);
      return;
    }

    setActiveCount((restaurants ?? []).filter((r) => r.partner_status === "active").length);
    // Highest earners first — the whole point of this view is spotting who's
    // driving revenue, not alphabetical browsing (that's what Manage
    // Existing is for).
    setRows((report ?? []).slice().sort((a, b) => Number(b.revenue) - Number(a.revenue)));
    setLoading(false);
  };

  // Only re-fetch when the date range actually changes via a preset or the
  // Refresh button — not on every keystroke while typing a date manually.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyPreset = (start, end) => {
    setStartDate(start);
    setEndDate(end);
  };

  const totalCheckins = rows.reduce((sum, r) => sum + Number(r.checkin_count), 0);
  const totalRevenue = rows.reduce((sum, r) => sum + Number(r.revenue), 0);

  return (
    <div>
      <h3>Date range</h3>
      <div className="button-row preset-row">
        <button type="button" className="link-button" onClick={() => applyPreset(todayISO(), todayISO())}>
          Today
        </button>
        <button
          type="button"
          className="link-button"
          onClick={() => applyPreset(daysAgoISO(6), todayISO())}
        >
          Last 7 days
        </button>
        <button
          type="button"
          className="link-button"
          onClick={() => applyPreset(daysAgoISO(29), todayISO())}
        >
          Last 30 days
        </button>
        <button type="button" className="link-button" onClick={() => applyPreset(startOfMonthISO(), todayISO())}>
          This month
        </button>
      </div>
      <div className="date-range-row">
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <span className="hint-text">to</span>
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        <button type="button" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-value">{activeCount}</span>
          <span className="stat-label">Active restaurants</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{totalCheckins}</span>
          <span className="stat-label">Check-ins in range</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{formatCurrency(totalRevenue)}</span>
          <span className="stat-label">Total revenue in range</span>
        </div>
      </div>

      <h3>By restaurant</h3>
      {loading ? (
        <p className="hint-text">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="hint-text">No restaurants yet.</p>
      ) : (
        <ul className="admin-list">
          {rows.map((r) => (
            <li key={r.restaurant_id} className="admin-list-row">
              <div>
                <strong>{r.restaurant_name}</strong>
                <div className="hint-text">
                  {r.partner_status !== "active" ? `${r.partner_status} · ` : ""}
                  {r.checkin_count} check-in{Number(r.checkin_count) === 1 ? "" : "s"}
                </div>
              </div>
              <div className="revenue-row-value">{formatCurrency(r.revenue)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------- Add New Partner (restaurant + character together) ---------------- */

const emptyPartnerForm = {
  name: "",
  neighborhood: "",
  city: "",
  address: "",
  cuisine_type: "",
  signature_dish: "",
  partner_status: "active",
  name_stage1: "",
  art_url_stage1: "",
  name_stage2: "",
  art_url_stage2: "",
  xp_threshold_stage2: 500,
  name_stage3: "",
  art_url_stage3: "",
  xp_threshold_stage3: 1000,
};

function NewPartnerPanel({ onCreated }) {
  const [form, setForm] = useState(emptyPartnerForm);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    // Restaurant first, then character — the character row needs the
    // restaurant's generated id as a foreign key. If the character insert
    // fails after the restaurant succeeds, we report it clearly so the
    // orphaned restaurant can be found and fixed in "Manage Existing"
    // rather than silently leaving a restaurant with no character.
    const { data: restaurant, error: restaurantError } = await supabase
      .from("restaurants")
      .insert({
        name: form.name,
        neighborhood: form.neighborhood || null,
        city: form.city,
        address: form.address || null,
        cuisine_type: form.cuisine_type || null,
        signature_dish: form.signature_dish || null,
        partner_status: form.partner_status,
      })
      .select()
      .single();

    if (restaurantError) {
      setError(restaurantError.message);
      setBusy(false);
      return;
    }

    const { error: characterError } = await supabase.from("foodling_characters").insert({
      restaurant_id: restaurant.id,
      name_stage1: form.name_stage1,
      art_url_stage1: form.art_url_stage1 || null,
      name_stage2: form.name_stage2,
      art_url_stage2: form.art_url_stage2 || null,
      xp_threshold_stage2: Number(form.xp_threshold_stage2),
      name_stage3: form.name_stage3,
      art_url_stage3: form.art_url_stage3 || null,
      xp_threshold_stage3: Number(form.xp_threshold_stage3),
    });

    if (characterError) {
      setError(
        `Restaurant "${form.name}" was created, but the character failed to save: ${characterError.message}. Fix it under "Manage Existing".`
      );
      setBusy(false);
      return;
    }

    setForm(emptyPartnerForm);
    setBusy(false);
    onCreated();
  };

  return (
    <form onSubmit={submit} className="admin-form">
      <h3>Restaurant</h3>
      <input placeholder="Name" value={form.name} onChange={set("name")} required />
      <input
        placeholder="Neighborhood"
        value={form.neighborhood}
        onChange={set("neighborhood")}
      />
      <input placeholder="City" value={form.city} onChange={set("city")} required />
      <input placeholder="Address" value={form.address} onChange={set("address")} />
      <input
        placeholder="Cuisine type"
        value={form.cuisine_type}
        onChange={set("cuisine_type")}
      />
      <input
        placeholder="Signature dish"
        value={form.signature_dish}
        onChange={set("signature_dish")}
      />
      <select value={form.partner_status} onChange={set("partner_status")}>
        <option value="active">active</option>
        <option value="pending">pending</option>
        <option value="paused">paused</option>
      </select>

      <h3>Character — Stage 1</h3>
      <input
        placeholder="Stage 1 name"
        value={form.name_stage1}
        onChange={set("name_stage1")}
        required
      />
      <input
        placeholder="Stage 1 art URL"
        value={form.art_url_stage1}
        onChange={set("art_url_stage1")}
      />

      <h3>Character — Stage 2</h3>
      <input
        placeholder="Stage 2 name"
        value={form.name_stage2}
        onChange={set("name_stage2")}
        required
      />
      <input
        placeholder="Stage 2 art URL"
        value={form.art_url_stage2}
        onChange={set("art_url_stage2")}
      />
      <input
        type="number"
        placeholder="XP threshold for stage 2"
        value={form.xp_threshold_stage2}
        onChange={set("xp_threshold_stage2")}
        required
      />

      <h3>Character — Stage 3</h3>
      <input
        placeholder="Stage 3 name"
        value={form.name_stage3}
        onChange={set("name_stage3")}
        required
      />
      <input
        placeholder="Stage 3 art URL"
        value={form.art_url_stage3}
        onChange={set("art_url_stage3")}
      />
      <input
        type="number"
        placeholder="XP threshold for stage 3"
        value={form.xp_threshold_stage3}
        onChange={set("xp_threshold_stage3")}
        required
      />

      {error && <p className="error-text">{error}</p>}
      <button type="submit" disabled={busy}>
        {busy ? "Creating…" : "Create partner"}
      </button>
    </form>
  );
}

/* ---------------- Manage Existing (restaurant + character together) ---------------- */

function ManageExistingPanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  const load = async () => {
    setLoading(true);
    const [{ data: restaurants }, { data: characters }, { data: staffWithEmail }] = await Promise.all([
      supabase.from("restaurants").select("*").order("name"),
      supabase.from("foodling_characters").select("*"),
      supabase.rpc("admin_list_staff_with_email"),
    ]);
    const charByRestaurant = new Map((characters ?? []).map((c) => [c.restaurant_id, c]));

    // A restaurant can have more than one staff account linked to it —
    // group all matching emails together rather than assuming just one.
    const emailsByRestaurant = new Map();
    for (const s of staffWithEmail ?? []) {
      const list = emailsByRestaurant.get(s.restaurant_id) ?? [];
      list.push(s.email);
      emailsByRestaurant.set(s.restaurant_id, list);
    }

    setRows(
      (restaurants ?? []).map((r) => ({
        restaurant: r,
        character: charByRestaurant.get(r.id) ?? null,
        staffEmails: emailsByRestaurant.get(r.id) ?? [],
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <p className="hint-text">Loading…</p>;

  return (
    <div>
      <h3>Existing partners ({rows.length})</h3>
      <ul className="admin-list">
        {rows.map(({ restaurant, character, staffEmails }) => (
          <li key={restaurant.id} className="admin-list-row-col">
            <div className="admin-list-row">
              <div>
                <strong>{restaurant.name}</strong>
                <div className="hint-text">
                  {restaurant.neighborhood ? restaurant.neighborhood + " · " : ""}
                  {restaurant.city} · {restaurant.partner_status}
                  {!character ? " · no character yet" : ""}
                </div>
                <div className="hint-text">
                  {staffEmails.length > 0 ? `Staff: ${staffEmails.join(", ")}` : "No staff account linked"}
                </div>
              </div>
              <button
                className="link-button"
                onClick={() => setExpandedId(expandedId === restaurant.id ? null : restaurant.id)}
              >
                {expandedId === restaurant.id ? "Close" : "Edit"}
              </button>
            </div>
            {expandedId === restaurant.id && (
              <PartnerEditForm
                restaurant={restaurant}
                character={character}
                onSaved={() => {
                  setExpandedId(null);
                  load();
                }}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PartnerEditForm({ restaurant, character, onSaved }) {
  const [form, setForm] = useState({
    name: restaurant.name ?? "",
    neighborhood: restaurant.neighborhood ?? "",
    city: restaurant.city ?? "",
    address: restaurant.address ?? "",
    cuisine_type: restaurant.cuisine_type ?? "",
    signature_dish: restaurant.signature_dish ?? "",
    partner_status: restaurant.partner_status ?? "active",
    name_stage1: character?.name_stage1 ?? "",
    art_url_stage1: character?.art_url_stage1 ?? "",
    name_stage2: character?.name_stage2 ?? "",
    art_url_stage2: character?.art_url_stage2 ?? "",
    xp_threshold_stage2: character?.xp_threshold_stage2 ?? 500,
    name_stage3: character?.name_stage3 ?? "",
    art_url_stage3: character?.art_url_stage3 ?? "",
    xp_threshold_stage3: character?.xp_threshold_stage3 ?? 1000,
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { error: restaurantError } = await supabase
      .from("restaurants")
      .update({
        name: form.name,
        neighborhood: form.neighborhood || null,
        city: form.city,
        address: form.address || null,
        cuisine_type: form.cuisine_type || null,
        signature_dish: form.signature_dish || null,
        partner_status: form.partner_status,
      })
      .eq("id", restaurant.id);

    if (restaurantError) {
      setError(restaurantError.message);
      setBusy(false);
      return;
    }

    const characterPayload = {
      name_stage1: form.name_stage1,
      art_url_stage1: form.art_url_stage1 || null,
      name_stage2: form.name_stage2,
      art_url_stage2: form.art_url_stage2 || null,
      xp_threshold_stage2: Number(form.xp_threshold_stage2),
      name_stage3: form.name_stage3,
      art_url_stage3: form.art_url_stage3 || null,
      xp_threshold_stage3: Number(form.xp_threshold_stage3),
    };

    const { error: characterError } = character
      ? await supabase.from("foodling_characters").update(characterPayload).eq("id", character.id)
      : await supabase
          .from("foodling_characters")
          .insert({ ...characterPayload, restaurant_id: restaurant.id });

    if (characterError) {
      setError(characterError.message);
      setBusy(false);
      return;
    }

    setBusy(false);
    onSaved();
  };

  return (
    <form onSubmit={submit} className="admin-form admin-form-nested">
      <h4>Restaurant</h4>
      <input placeholder="Name" value={form.name} onChange={set("name")} required />
      <input
        placeholder="Neighborhood"
        value={form.neighborhood}
        onChange={set("neighborhood")}
      />
      <input placeholder="City" value={form.city} onChange={set("city")} required />
      <input placeholder="Address" value={form.address} onChange={set("address")} />
      <input
        placeholder="Cuisine type"
        value={form.cuisine_type}
        onChange={set("cuisine_type")}
      />
      <input
        placeholder="Signature dish"
        value={form.signature_dish}
        onChange={set("signature_dish")}
      />
      <select value={form.partner_status} onChange={set("partner_status")}>
        <option value="active">active</option>
        <option value="pending">pending</option>
        <option value="paused">paused</option>
      </select>

      <h4>Character — Stage 1</h4>
      <input
        placeholder="Stage 1 name"
        value={form.name_stage1}
        onChange={set("name_stage1")}
        required
      />
      <input
        placeholder="Stage 1 art URL"
        value={form.art_url_stage1}
        onChange={set("art_url_stage1")}
      />

      <h4>Character — Stage 2</h4>
      <input
        placeholder="Stage 2 name"
        value={form.name_stage2}
        onChange={set("name_stage2")}
        required
      />
      <input
        placeholder="Stage 2 art URL"
        value={form.art_url_stage2}
        onChange={set("art_url_stage2")}
      />
      <input
        type="number"
        placeholder="XP threshold for stage 2"
        value={form.xp_threshold_stage2}
        onChange={set("xp_threshold_stage2")}
        required
      />

      <h4>Character — Stage 3</h4>
      <input
        placeholder="Stage 3 name"
        value={form.name_stage3}
        onChange={set("name_stage3")}
        required
      />
      <input
        placeholder="Stage 3 art URL"
        value={form.art_url_stage3}
        onChange={set("art_url_stage3")}
      />
      <input
        type="number"
        placeholder="XP threshold for stage 3"
        value={form.xp_threshold_stage3}
        onChange={set("xp_threshold_stage3")}
        required
      />

      {error && <p className="error-text">{error}</p>}
      <button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}

/* ---------------- Staff ---------------- */

const emptyStaff = {
  id: "",
  restaurant_id: "",
  display_name: "",
  active: true,
};

function StaffPanel() {
  const [rows, setRows] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyStaff);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: staffData }, { data: restaurantData }, { data: staffWithEmail }] = await Promise.all([
      supabase.from("staff").select("*, restaurants(name)").order("created_at"),
      supabase.from("restaurants").select("id, name").order("name"),
      supabase.rpc("admin_list_staff_with_email"),
    ]);
    const emailById = new Map((staffWithEmail ?? []).map((s) => [s.id, s.email]));
    setRows((staffData ?? []).map((s) => ({ ...s, email: emailById.get(s.id) ?? null })));
    setRestaurants(restaurantData ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const startEdit = (row) => {
    setEditingId(row.id);
    setForm({
      id: row.id,
      restaurant_id: row.restaurant_id ?? "",
      display_name: row.display_name ?? "",
      active: row.active,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyStaff);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    if (editingId) {
      const { error } = await supabase
        .from("staff")
        .update({
          restaurant_id: form.restaurant_id,
          display_name: form.display_name,
          active: form.active,
        })
        .eq("id", editingId);
      if (error) setError(error.message);
      else {
        cancelEdit();
        load();
      }
    } else {
      const { error } = await supabase.from("staff").insert({
        id: form.id,
        restaurant_id: form.restaurant_id,
        display_name: form.display_name,
        active: form.active,
      });
      if (error) setError(error.message);
      else {
        cancelEdit();
        load();
      }
    }
    setBusy(false);
  };

  if (loading) return <p className="hint-text">Loading staff…</p>;

  return (
    <div>
      <p className="hint-text">
        Create the login account first in Supabase → Authentication → Users, then paste its User
        UID below to link it to a restaurant.
      </p>
      <form onSubmit={submit} className="admin-form">
        <h3>{editingId ? "Edit staff account" : "Link staff account"}</h3>
        {!editingId && (
          <input
            placeholder="User UUID (from Supabase Auth)"
            value={form.id}
            onChange={(e) => setForm({ ...form, id: e.target.value })}
            required
          />
        )}
        <select
          value={form.restaurant_id}
          onChange={(e) => setForm({ ...form, restaurant_id: e.target.value })}
          required
        >
          <option value="" disabled>
            Select restaurant…
          </option>
          {restaurants.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <input
          placeholder="Display name"
          value={form.display_name}
          onChange={(e) => setForm({ ...form, display_name: e.target.value })}
          required
        />
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Active
        </label>
        {error && <p className="error-text">{error}</p>}
        <div className="button-row">
          <button type="submit" disabled={busy}>
            {busy ? "Saving…" : editingId ? "Save changes" : "Link staff account"}
          </button>
          {editingId && (
            <button type="button" className="link-button" onClick={cancelEdit}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <h3>Existing staff ({rows.length})</h3>
      <ul className="admin-list">
        {rows.map((s) => (
          <li key={s.id} className="admin-list-row">
            <div>
              <strong>{s.display_name}</strong>
              <div className="hint-text">
                {s.restaurants?.name ?? "(unlinked)"} · {s.active ? "active" : "inactive"}
              </div>
              <div className="hint-text">{s.email ?? `id: ${s.id}`}</div>
            </div>
            <button className="link-button" onClick={() => startEdit(s)}>
              Edit
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}