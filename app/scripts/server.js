/******************************************************************************
 * server.js
 * Description:
 *   Express API for parking occupancy using Firestore. Provides endpoints to:
 *   - Record immutable ENTRY/EXIT events (Req 15, 16, 17, 18)
 *   - Update current occupancy atomically (Req 19, 21)
 *   - Return current count/status for the web app (Req 22, 35, 36)
 *   - Health check endpoint
 *
 * Programmer: Samantha Adorno
 * Created: 2026-02-09
 *
 * Revisions:
 *   - 2026-02-15 (Samantha Adorno): Added comments
 *
 * Preconditions:
 *   - Valid Firebase Admin service account JSON file is available
 *   - Firestore enabled; lots/{lotId} documents exist (optional: numeric capacity field)
 *
 * Inputs (acceptable):
 *   - CLI: --serviceAccount=<path>
 *   - POST /event/entry body: { lotId: string, sensorId: string }   (Req 15)
 *   - POST /event/exit  body: { lotId: string, sensorId: string }   (Req 16)
 *   - GET /lot/:lotId/count, GET /lot/:lotId/status                 (Req 22, 35, 36)
 *
 * Outputs:
 *   - POST endpoints: 201 { ok: true, id } on success; else { ok: false, error }
 *   - GET endpoints: 200 { ok: true, ... } on success; else { ok: false, error }
 *
 * Errors:
 *   - 400: invalid/missing fields (Req 13)
 *   - 404: unknown lotId for event recording
 *   - 500: unexpected server/Firestore errors
 *
 * Postconditions:
 *   - Event is created at lots/{lotId}/events/{eventId} (Req 17, 18)
 *   - Status is updated at lots/{lotId}/_meta/current_status (Req 19, 21)
 *
 * Side Effects:
 *   - Reads/writes Firestore; starts HTTP server
 *
 * Invariants:
 *   - Events are immutable (created once, not overwritten) (Req 17)
 *   - Occupancy clamped to [0, capacity] when capacity is defined (Req 21)
 *
 * Limitations:
 *   - Authentication for POST/GET is not implemented in this file (Req 11, 35)
 ******************************************************************************/

const express = require("express");
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// CLI config + Firebase Admin init
const raw = process.argv.slice(2);
const flags = {};
for (const a of raw) {
  if (a.startsWith("--")) {
    const [k, v] = a.replace(/^--/, "").split("=");
    flags[k] = v === undefined ? true : v;
  }
}

const SERVICE_ACCOUNT_PATH =
  flags.serviceAccount ||
  "../env/parking-capstone-9778c-firebase-adminsdk-fbsvc-c1179e192c.json";

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error(`Service account not found at: ${SERVICE_ACCOUNT_PATH}`);
  process.exit(1);
}

const serviceAccount = require(path.resolve(SERVICE_ACCOUNT_PATH));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();
const app = express();
app.use(express.json({ limit: "256kb" }));

// ----------- Function: required-string validation (Req 13) -----------
function assertString(name, val) {
  if (!val || typeof val !== "string") {
    const err = new Error(`${name} is required (string)`);
    err.status = 400;
    throw err;
  }
}

// ----------- Function: unique event id generation (Req 18) -----------
function makeId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
}

// ----------- Function: atomic event record + occupancy update (Req 17, 18, 19, 21, 14) -----------
async function recordLotEvent({ lotId, sensorId, eventType }) {
  assertString("lotId", lotId);
  assertString("sensorId", sensorId);

  if (!["ENTRY", "EXIT"].includes(eventType)) {
    const err = new Error("eventType must be ENTRY or EXIT");
    err.status = 400;
    throw err;
  }

  const id = makeId();

  const lotRef = db.collection("lots").doc(lotId);
  const statusRef = lotRef.collection("_meta").doc("current_status");
  const eventRef = lotRef.collection("events").doc(id);

  await db.runTransaction(async (t) => {
    const lotSnap = await t.get(lotRef);
    if (!lotSnap.exists) {
      const err = new Error(`Unknown lotId: ${lotId}`);
      err.status = 404;
      throw err;
    }

    const lot = lotSnap.data() || {};
    const cap = typeof lot.capacity === "number" ? lot.capacity : null;

    const statusSnap = await t.get(statusRef);
    const current = statusSnap.exists ? (statusSnap.data().count_now || 0) : 0;

    const delta = eventType === "ENTRY" ? 1 : -1;
    let newCount = current + delta;

    // Req 21: enforce occupancy limits
    if (newCount < 0) newCount = 0;
    if (cap !== null && newCount > cap) newCount = cap;

    // Req 17/18/14: immutable event record with server timestamp
    t.create(eventRef, {
      id,
      lotId,
      sensorId,
      eventType,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Req 19/14: update occupancy + last updated timestamp
    t.set(
      statusRef,
      {
        count_now: newCount,
        last_updated: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  return { id };
}

//  Write endpoints (Req 15, 16, 13) -----------

// Req 15: POST /event/entry records an ENTRY event
app.post("/event/entry", async (req, res) => {
  try {
    const { lotId, sensorId } = req.body || {};
    const result = await recordLotEvent({ lotId, sensorId, eventType: "ENTRY" });
    res.status(201).json({ ok: true, ...result });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, error: e.message || String(e) });
  }
});

// Req 16: POST /event/exit records an EXIT event
app.post("/event/exit", async (req, res) => {
  try {
    const { lotId, sensorId } = req.body || {};
    const result = await recordLotEvent({ lotId, sensorId, eventType: "EXIT" });
    res.status(201).json({ ok: true, ...result });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, error: e.message || String(e) });
  }
});

// Read endpoints for web app (Req 22, 35, 36) -----------

// Req 35: GET endpoint to retrieve occupancy data (count)
app.get("/lot/:lotId/count", async (req, res) => {
  try {
    const lotId = req.params.lotId;
    const statusRef = db.collection("lots").doc(lotId).collection("_meta").doc("current_status");
    const snap = await statusRef.get();
    const count = snap.exists ? (snap.data().count_now || 0) : 0;
    res.json({ ok: true, lotId, count_now: count });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// Req 35: GET endpoint to retrieve occupancy data (full status)
app.get("/lot/:lotId/status", async (req, res) => {
  try {
    const lotId = req.params.lotId;
    const statusRef = db.collection("lots").doc(lotId).collection("_meta").doc("current_status");
    const snap = await statusRef.get();
    res.json({
      ok: true,
      lotId,
      ...(snap.exists ? snap.data() : { count_now: 0, last_updated: null }),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

app.get("/health", (req, res) => res.json({ ok: true }));

// server start
const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
