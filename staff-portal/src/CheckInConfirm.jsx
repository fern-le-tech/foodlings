import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";
import { supabase } from "./supabase.js";

const SCANNER_ELEMENT_ID = "qr-reader";

async function safeStop(scanner) {
  if (scanner && scanner.getState() === Html5QrcodeScannerState.SCANNING) {
    await scanner.stop().catch(() => {});
  }
}

export function CheckInConfirm({ session }) {
  const [staffRow, setStaffRow] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [amount, setAmount] = useState("");
  const [checkinResult, setCheckinResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const scannerRef = useRef(null);

  useEffect(() => {
    supabase
      .from("staff")
      .select("*, restaurants(name)")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => setStaffRow(data));
  }, [session.user.id]);

  const startScan = () => {
    setError(null);
    setCustomer(null);
    setCheckinResult(null);
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
          resolveCheckinToken(decodedText);
        },
        () => {}
      )
      .catch((err) => {
        setError("Camera access failed: " + err.message);
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

  const resolveCheckinToken = async (token) => {
    if (!staffRow) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("resolve-checkin-token", {
        body: { token, restaurantId: staffRow.restaurant_id },
      });
      if (error) throw error;
      setCustomer(data);
    } catch (err) {
      setError(err.message ?? "Could not read that code — ask the customer to refresh it.");
    } finally {
      setBusy(false);
    }
  };

  const confirmCheckin = async (e) => {
    e.preventDefault();
    if (!customer || !staffRow) return;
    const parsedAmount = parseFloat(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
      setError("Enter a valid order total.");
      return;
    }

    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc("process_checkin", {
      p_user_id: customer.userId,
      p_restaurant_id: staffRow.restaurant_id,
      p_staff_id: session.user.id,
      p_amount: parsedAmount,
    });

    if (error) {
      setError(error.message);
    } else {
      setCheckinResult(data?.[0] ?? null);
    }
    setBusy(false);
  };

  const reset = () => {
    setCustomer(null);
    setAmount("");
    setCheckinResult(null);
    setError(null);
  };

  if (!staffRow) {
    return <p className="hint-text">Loading staff profile…</p>;
  }

  return (
    <div className="card">
      <h2>{staffRow.restaurants?.name}</h2>

      {!scanning && !customer && !checkinResult && (
        <div className="button-row">
          <button onClick={startScan}>Scan customer QR</button>
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

      {customer && !checkinResult && (
        <form onSubmit={confirmCheckin}>
          <p className="customer-line">
            <strong>{customer.displayName}</strong> · visit #{customer.visitCount + 1}
          </p>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Order total ($)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
            required
          />
          <button type="submit" disabled={busy}>
            {busy ? "Confirming…" : "Confirm check-in"}
          </button>
          <button type="button" className="link-button" onClick={reset}>
            Start over
          </button>
        </form>
      )}

      {checkinResult && (
        <div>
          <p className="success-line">
            {checkinResult.rate_limited
              ? "Logged — xp/points already earned in the last 4 hours."
              : `+${checkinResult.xp_awarded} xp, +${checkinResult.points_awarded} pts${checkinResult.evolved ? " — evolution unlocked!" : ""}`}
          </p>
          <button onClick={reset}>Next customer</button>
        </div>
      )}

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}