import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

// HTTPS is required here, not optional -- browsers block camera access
// (getUserMedia, used by the QR scanner in CheckInConfirm.jsx) on any
// origin that isn't localhost or HTTPS. Staff test this portal from a
// phone/tablet over the LAN (see app.json's staffPortalUrl), which is
// neither, so without this the scanner fails outright with a generic
// "Camera access failed" error and no permission prompt ever shown.
// basicSsl generates a self-signed cert -- the browser will warn once on
// first visit ("Your connection is not private"); staff need to tap
// through it ("Advanced" -> "Proceed"), same as any local HTTPS dev setup.
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    https: true,
    host: true,
  },
});
