// server.js
const express = require("express");
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

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

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const app = express();
app.use(express.json({ limit: "256kb" }));

// -------------------- helpers --------------------
function assertString(name, val) {
  if (!val || typeof val !== "string") {
    const err = new Error(`${name} is required (string)`);
    err.status = 400;
    throw err;
  }
}

function makeId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
}

/**
 * Records an immutable ENTRY/EXIT event AND updates the lot's current count atomically.
 * Writes event to: lots/{lotId}/events/{eventId}
 * Updates status:  lots/{lotId}/_meta/current_status
 */
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

    // clamp
    if (newCount < 0) newCount = 0;
    if (cap !== null && newCount > cap) newCount = cap;

    // Immutable event record: create only
    t.create(eventRef, {
      id,
      lotId,
      sensorId,
      eventType,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update current status
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



// -------------------- endpoints --------------------

// Record ENTRY 
app.post("/event/entry", async (req, res) => {
  try {
    const { lotId, sensorId } = req.body || {};
    const result = await recordLotEvent({ lotId, sensorId, eventType: "ENTRY" });

    res.status(201).json({ ok: true, ...result });
  } catch (e) {
    res
      .status(e.status || 500)
      .json({ ok: false, error: e.message || String(e) });
  }
});

// Record EXIT 
app.post("/event/exit", async (req, res) => {
  try {
    const { lotId, sensorId } = req.body || {};
    const result = await recordLotEvent({ lotId, sensorId, eventType: "EXIT" });
    res.status(201).json({ ok: true, ...result });
  } catch (e) {
    res
      .status(e.status || 500)
      .json({ ok: false, error: e.message || String(e) });
  }
});

// Count right now for a lot
app.get("/lot/:lotId/count", async (req, res) => {
  try {
    const lotId = req.params.lotId;
    const statusRef = db
      .collection("lots")
      .doc(lotId)
      .collection("_meta")
      .doc("current_status");

    const snap = await statusRef.get();
    const count = snap.exists ? (snap.data().count_now || 0) : 0;

    res.json({ ok: true, lotId, count_now: count });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// Full status
app.get("/lot/:lotId/status", async (req, res) => {
  try {
    const lotId = req.params.lotId;
    const statusRef = db
      .collection("lots")
      .doc(lotId)
      .collection("_meta")
      .doc("current_status");

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

// -------------------- start server --------------------
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
