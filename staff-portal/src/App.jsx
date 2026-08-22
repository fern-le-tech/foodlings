import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { StaffLogin } from "./StaffLogin.jsx";
import { CheckInConfirm } from "./CheckInConfirm.jsx";
import { AdminDashboard } from "./AdminDashboard.jsx";
import { StaffRewardsManager } from "./StaffRewardsManager.jsx";
import { StaffDailyDealsManager } from "./StaffDailyDealsManager.jsx";
import { StaffEvolutionSettings } from "./StaffEvolutionSettings.jsx";

const ADMIN_EMAILS = ["fernando.lambar@gmail.com"];
const THEME_STORAGE_KEY = "foodlings-staff-theme";

function getInitialTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function App() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [staffTab, setStaffTab] = useState("checkin"); // "checkin" | "rewards" | "deals" | "evolution"
  // Admin accounts default into the Admin dashboard, but an admin can also be
  // linked as staff at their own restaurant (e.g. fernando.lambar@gmail.com
  // at city o city) with no separate login for it — this lets them switch
  // views without signing into a different account.
  const [viewMode, setViewMode] = useState("admin"); // "admin" | "staff" — only meaningful when isAdmin
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  if (!ready) return null;

  const isAdmin = session && ADMIN_EMAILS.includes(session.user.email);
  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Foodlings — {isAdmin ? (viewMode === "admin" ? "Admin" : "Staff") : "Staff"}</h1>
        <div className="theme-toggle">
          {isAdmin && (
            <button
              type="button"
              className="link-button"
              onClick={() => setViewMode(viewMode === "admin" ? "staff" : "admin")}
            >
              {viewMode === "admin" ? "Switch to my staff view" : "Switch to Admin"}
            </button>
          )}
          <span className="theme-toggle-label">{theme === "dark" ? "Night" : "Day"}</span>
          <button
            type="button"
            className="theme-toggle-switch"
            onClick={toggleTheme}
            aria-label="Toggle day/night mode"
          />
          {session && (
            <button className="link-button" onClick={() => supabase.auth.signOut()}>
              Log out
            </button>
          )}
        </div>
      </header>
      {!session ? (
        <StaffLogin />
      ) : isAdmin && viewMode === "admin" ? (
        <AdminDashboard />
      ) : (
        <>
          <div className="tab-row">
            <button
              className={staffTab === "checkin" ? "tab-button tab-active" : "tab-button"}
              onClick={() => setStaffTab("checkin")}
            >
              Check In
            </button>
            <button
              className={staffTab === "rewards" ? "tab-button tab-active" : "tab-button"}
              onClick={() => setStaffTab("rewards")}
            >
              Rewards
            </button>
            <button
              className={staffTab === "deals" ? "tab-button tab-active" : "tab-button"}
              onClick={() => setStaffTab("deals")}
            >
              Daily Deals
            </button>
            <button
              className={staffTab === "evolution" ? "tab-button tab-active" : "tab-button"}
              onClick={() => setStaffTab("evolution")}
            >
              Evolution
            </button>
          </div>
          {staffTab === "checkin" ? (
            <CheckInConfirm session={session} />
          ) : staffTab === "rewards" ? (
            <StaffRewardsManager session={session} />
          ) : staffTab === "deals" ? (
            <StaffDailyDealsManager session={session} />
          ) : (
            <StaffEvolutionSettings session={session} />
          )}
        </>
      )}
    </div>
  );
}
