const {onRequest} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();

function assertString(name, val) {
  if (!val || typeof val !== "string") {
    const err = new Error(`${name} is required (string)`);
    err.status = 400;
    throw err;
  }
}

function makeId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
}

exports.event = onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ok: false, error: "Method not allowed"});
    }

    const body = req.body || {};
    const lotId = body.lotId;
    const sensorId = body.sensorId;
    const eventType = body.eventType;

    assertString("lotId", lotId);
    assertString("sensorId", sensorId);
    assertString("eventType", eventType);

    if (eventType !== "ENTRY" && eventType !== "EXIT") {
      return res
          .status(400)
          .json({ok: false, error: "eventType must be ENTRY or EXIT"});
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
      const current= statusSnap.exists ? (statusSnap.data().count_now || 0) : 0;

      const delta = eventType === "ENTRY" ? 1 : -1;
      let next = current + delta;

      if (next < 0) next = 0;
      if (cap !== null && next > cap) next = cap;

      t.create(eventRef, {
        id,
        lotId,
        sensorId,
        eventType,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      t.set(
          statusRef,
          {
            count_now: next,
            last_updated: admin.firestore.FieldValue.serverTimestamp(),
          },
          {merge: true},
      );
    });

    return res.status(201).json({ok: true, id});
  } catch (e) {
    return res
        .status(e.status || 500)
        .json({ok: false, error: e.message || String(e)});
  }
});
