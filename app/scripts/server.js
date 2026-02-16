/******************************************************************************
 * Code Artifact: app/scripts/server.js
 *
 * Description:
 *   Express server for the website that provides READ-ONLY endpoints to retrieve
 *   real-time occupancy data from Firestore. This server does NOT write to Firestore.
 *
 * Implements Requirements:
 *   - Req 35: Provide a GET endpoint for the web application to retrieve occupancy data
 *   - Req 36: Website fetches occupancy via this GET endpoint instead of mock data
 *   - Req 22: Supports near-real-time updates (typical refresh within 1–3 seconds)
 *
 * Programmer: Samantha Adorno
 * Created: 2026-02-09
 * Revision: 2026-02-14 (added comments)
 * Revision: 2026-02-15 (moved logic to functions/index.js, and added GET endpoints for website)

 * Preconditions:
 *   - Firebase Admin service account JSON exists and Firestore is enabled
 *   - lots/{lotId}/_meta/current_status may exist (otherwise defaults returned)
 *
 * Side Effects:
 *   - Reads Firestore only (no writes)
 ******************************************************************************/

const express = require("express");
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

//  Firebase Admin initialization (READ-ONLY usage) -----------
const SERVICE_ACCOUNT_PATH =
  process.env.SERVICE_ACCOUNT_PATH ||
  "../env/parking-capstone-9778c-firebase-adminsdk-fbsvc-c1179e192c.json";

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error(`Service account not found at: ${SERVICE_ACCOUNT_PATH}`);
  process.exit(1);
}

const serviceAccount = require(path.resolve(SERVICE_ACCOUNT_PATH));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();
const app = express();

//  validate required string params (Req 13) -----------
function assertString(name, val) {
  if (!val || typeof val !== "string") {
    const err = new Error(`${name} is required (string)`);
    err.status = 400;
    throw err;
  }
}

//  GET endpoints for website (Req 35, 36) -----------

// Req 35: GET /api/lot/:lotId/status returns current occupancy + timestamps
app.get("/api/lot/:lotId/status", async (req, res) => {
  try {
    const lotId = req.params.lotId;
    assertString("lotId", lotId);

    const statusRef = db
      .collection("lots")
      .doc(lotId)
      .collection("_meta")
      .doc("current_status");

    const snap = await statusRef.get();
    const data = snap.exists ? snap.data() : { count_now: 0, last_updated: null };

    return res.json({ ok: true, lotId, ...data });
  } catch (e) {
    return res.status(e.status || 500).json({ ok: false, error: e.message || String(e) });
  }
});

// GET /api/lot/:lotId/count
app.get("/api/lot/:lotId/count", async (req, res) => {
  try {
    const lotId = req.params.lotId;
    assertString("lotId", lotId);

    const statusRef = db
      .collection("lots")
      .doc(lotId)
      .collection("_meta")
      .doc("current_status");

    const snap = await statusRef.get();
    const count = snap.exists ? (snap.data().count_now || 0) : 0;

    return res.json({ ok: true, lotId, count_now: count });
  } catch (e) {
    return res.status(e.status || 500).json({ ok: false, error: e.message || String(e) });
  }
});

// start server (basic startup logging) -----------
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Web server listening on http://localhost:${port}`));
