/******************************************************************************
 * Code Artifact: functions/index.js
 *
 * Description:
 *   Firebase Cloud Functions (HTTPS) that handle authenticated event writes for
 *   a parking lot system. This file is the authoritative write path to Firestore
 *   for ENTRY/EXIT events and occupancy updates.
 *
 * Implements Requirements:
 *   - Req 11: Authenticated POST requests from Raspberry Pi (x-api-key)
 *   - Req 12: Validate requests in Cloud Function before writing to Firestore
 *   - Req 13: Reject unauthorized/malformed requests with clear errors
 *   - Req 14: Store server-side timestamps for events and status updates
 *   - Req 15: POST endpoint to record ENTRY events
 *   - Req 16: POST endpoint to record EXIT events
 *   - Req 17: Write immutable event records (create-only)
 *   - Req 18: Include unique id, timestamp, eventType in each event record
 *   - Req 19: Update occupancy count based on entry/exit events
 *   - Req 21: Enforce occupancy limits (0 ≤ occupancy ≤ capacity)
 *
 * Programmer: Samantha Adorno
 * Created: 2026-02-9
 * Revision: 2026-02-15 (deployed coud function and move writing logic from server.js to here)
 *
 * Preconditions:
 *   - Firebase project initialized and Firestore enabled
 *   - lots/{lotId} documents exist (optional numeric "capacity" field)
 *   - API_KEY environment variable optionally configured for authentication
 *
 * Inputs:
 *   - POST /event/entry body: { lotId: string, sensorId: string }
 *   - POST /event/exit  body: { lotId: string, sensorId: string }
 *   - Header: x-api-key (required if API_KEY is set)
 *
 * Outputs:
 *   - 201 { ok: true, id } on success
 *   - 400/401/404/500 { ok: false, error } on failure
 *
 * Side Effects:
 *   - Creates an immutable event document in Firestore
 *   - Updates a lot occupancy status document in Firestore
 *
 * Invariants:
 *   - Events are created once and never overwritten (Req 17)
 *   - Occupancy is clamped within valid bounds (Req 21)
 ******************************************************************************/

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");

// ----------- Firebase initialization -----------
admin.initializeApp();
const db = admin.firestore();

// -----------  input validation (Req 12, 13) -----------
function assertString(name, val) {
  if (!val || typeof val !== "string") {
    const err = new Error(`${name} is required (string)`);
    err.status = 400;
    throw err;
  }
}

// -----------  unique ID generation (Req 18) -----------
function makeId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
}

// ----------- auth check using API key header (Req 11, 13) -----------
function requireApiKey(req) {
  const API_KEY = process.env.API_KEY;
  if (!API_KEY) return; 

  const got = req.get("x-api-key");
  if (got !== API_KEY) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
}

// ----------- transactional event write + occupancy update (Req 14, 17–19, 21) -----------
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
    let next = current + delta;

    // Req 21: enforce occupancy bounds
    if (next < 0) next = 0;
    if (cap !== null && next > cap) next = cap;

    // Req 17/18/14: immutable event record with server timestamp
    t.create(eventRef, {
      id,
      lotId,
      sensorId,
      eventType,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Req 19/14: update occupancy with server timestamp
    t.set(
      statusRef,
      {
        count_now: next,
        last_updated: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  return { id };
}

// ----------- Write endpoints (Req 15, 16) -----------

// Req 15: POST /event/entry
exports.eventEntry = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    requireApiKey(req);

    const { lotId, sensorId } = req.body || {};
    const result = await recordLotEvent({ lotId, sensorId, eventType: "ENTRY" });

    return res.status(201).json({ ok: true, ...result });
  } catch (e) {
    return res.status(e.status || 500).json({ ok: false, error: e.message || String(e) });
  }
});

// Req 16: POST /event/exit
exports.eventExit = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    requireApiKey(req);

    const { lotId, sensorId } = req.body || {};
    const result = await recordLotEvent({ lotId, sensorId, eventType: "EXIT" });

    return res.status(201).json({ ok: true, ...result });
  } catch (e) {
    return res.status(e.status || 500).json({ ok: false, error: e.message || String(e) });
  }
});
