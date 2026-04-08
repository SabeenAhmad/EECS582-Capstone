/******************************************************************************
 * Code Artifact: functions/index.js
 * Names:
 * Date:
 * Description:
 *   Firebase Cloud Functions (HTTPS) that handle authenticated event writes for
 *   a parking lot system. This file is the authoritative write path to Firestore
 *   for ENTRY/EXIT events and occupancy updates.
 *
 * Implements Requirements:
 *   - Req 9 : Prevent duplicate vehicle events using cooldown logic (configurable)
 *   - Req 10: Define/enforce JSON schema for occupancy update payloads
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
 * Revision: 2026-02-25 (added openai proxy)
 * Revision: 2026-02-28 (added scheduled data analysis)
 * Preconditions:
 *   - Firebase project initialized and Firestore enabled
 *   - lots/{lotId} documents exist 
 *   - API_KEY environment variable configured for authentication
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
const { defineSecret } = require('firebase-functions/params');

// Define the OpenAI API key as a secret
const openaiApiKey = defineSecret('OPENAI_API_KEY');

// ----------- Firebase initialization -----------
admin.initializeApp();
const db = admin.firestore();

// ----------- Req 9: configurable cooldown -----------
const COOLDOWN_MS = Number(process.env.COOLDOWN_MS || 1200);
if (!Number.isFinite(COOLDOWN_MS) || COOLDOWN_MS < 0) {
  // Fail safe: if misconfigured, default to 1200ms
  // (Do not throw at module load; keep function deployable.)
}

// ----------- helpers -----------
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

// Req 13: basic string validation
function assertString(name, val) {
  if (!val || typeof val !== "string") {
    httpError(400, `${name} is required (string)`);
  }
}

// Req 10: enforce payload "schema" (strict keys + types)
// Schema for both endpoints:
// {
//   lotId: string (non-empty),
//   sensorId: string (non-empty)
// }
function validateEventPayload(body) {
  // Content-type safety: if body is undefined, it can be missing JSON parsing
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    httpError(400, "Request body must be a JSON object");
  }

  const allowedKeys = new Set(["lotId", "sensorId"]);
  for (const k of Object.keys(body)) {
    if (!allowedKeys.has(k)) {
      httpError(400, `Unexpected field: ${k}`);
    }
  }

  assertString("lotId", body.lotId);
  assertString("sensorId", body.sensorId);

  const lotId = body.lotId.trim();
  const sensorId = body.sensorId.trim();

  if (!lotId) httpError(400, "lotId must be a non-empty string");
  if (!sensorId) httpError(400, "sensorId must be a non-empty string");

  const idRe = /^[A-Za-z0-9._-]+$/;
  if (!idRe.test(lotId)) httpError(400, "lotId contains invalid characters");
  if (!idRe.test(sensorId)) httpError(400, "sensorId contains invalid characters");

  return { lotId, sensorId };
}

// Req 18: unique ID generation
function makeId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
}

// Req 13: auth check using API key header
function requireApiKey(req) {
  const API_KEY = process.env.API_KEY;
  if (!API_KEY) return;

  const got = req.get("x-api-key");
  if (got !== API_KEY) {
    httpError(401, "Unauthorized");
  }
}

// Req 9: compute a stable cooldown doc id for (sensor,eventType)
function cooldownDocId(sensorId, eventType) {
  // Keep it filesystem/doc-id safe
  return `${sensorId}_${eventType}`;
}

// ----------- transactional event write + occupancy update (Req 9, 14, 17–19, 21) -----------
async function recordLotEvent({ lotId, sensorId, eventType }) {
  assertString("lotId", lotId);
  assertString("sensorId", sensorId);

  if (!["ENTRY", "EXIT"].includes(eventType)) {
    httpError(400, "eventType must be ENTRY or EXIT");
  }

  const id = makeId();

  const lotRef = db.collection("lots").doc(lotId);
  const statusRef = lotRef.collection("_meta").doc("current_status");
  const eventRef = lotRef.collection("events").doc(id);

  // Req 9: cooldown ref stored under _meta/cooldowns
  const cooldownRef = lotRef
    .collection("_meta")
    .doc("cooldowns")
    .collection("by_sensor_event")
    .doc(cooldownDocId(sensorId, eventType));

  const nowMs = Date.now();

  // If deduped, we'll return this instead of creating event/update
  let deduped = false;
  let computedNext = null; //for historical averages purposes

  await db.runTransaction(async (t) => {
  const lotSnap = await t.get(lotRef);
  if (!lotSnap.exists) {
    httpError(404, `Unknown lotId: ${lotId}`);
  }

  const cdSnap = await t.get(cooldownRef);
  const statusSnap = await t.get(statusRef);

  const lastMs = cdSnap.exists ? Number(cdSnap.data().last_event_ms || 0) : 0;
  const lot = lotSnap.data() || {};
  const cap = typeof lot.capacity === "number" ? lot.capacity : null;
  const current = statusSnap.exists ? (statusSnap.data().count_now || 0) : 0;

  if (Number.isFinite(lastMs) && nowMs - lastMs < COOLDOWN_MS) {
    deduped = true;

    t.set(
      cooldownRef,
      {
        last_event_ms: nowMs,
        last_event_type: eventType,
        last_sensor_id: sensorId,
        last_updated: admin.firestore.FieldValue.serverTimestamp(),
        cooldown_ms: COOLDOWN_MS,
      },
      { merge: true }
    );

    return;
  }

  const delta = eventType === "ENTRY" ? 1 : -1;
  let next = current + delta;

  if (next < 0) next = 0;
  if (cap !== null && next > cap) next = cap;

  computedNext = next;

  t.set(
    cooldownRef,
    {
      last_event_ms: nowMs,
      last_event_type: eventType,
      last_sensor_id: sensorId,
      last_updated: admin.firestore.FieldValue.serverTimestamp(),
      cooldown_ms: COOLDOWN_MS,
    },
    { merge: true }
  );

  t.create(eventRef, {
    id,
    lotId,
    sensorId,
    eventType,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    occupancy_before: current,
    occupancy_after: next,
  });

  t.set(
    statusRef,
    {
      count_now: next,
      last_updated: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  t.set(
    lotRef,
    {
      currentOccupancy: next,
      last_updated: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
});


  // Req 9: communicate dedupe result clearly
  if (deduped) {
    return { deduped: true, cooldown_ms: COOLDOWN_MS };
  }

  return { id, deduped: false, next: computedNext };
}

// ----------- Write endpoints (Req 15, 16) -----------

// Req 15: POST /event/entry
exports.eventEntry = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    requireApiKey(req);

    // Req 10: schema validation
    const { lotId, sensorId } = validateEventPayload(req.body);

    const result = await recordLotEvent({ lotId, sensorId, eventType: "ENTRY" });

    // If deduped, return 200 (no new event created)
    if (result.deduped) {
      return res.status(200).json({ ok: true, ...result });
    }

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

    // Req 10: schema validation
    const { lotId, sensorId } = validateEventPayload(req.body);

    const result = await recordLotEvent({ lotId, sensorId, eventType: "EXIT" });

    if (result.deduped) {
      return res.status(200).json({ ok: true, ...result });
    }

    return res.status(201).json({ ok: true, ...result });
  } catch (e) {
    return res.status(e.status || 500).json({ ok: false, error: e.message || String(e) });
  }
});

// Data analysis - Triggered by Cloud Scheduler via HTTP endpoint
/**
 * POST /scheduleAnalytics
 * 
 * Recomputes hourly parking averages for all lots
 * Triggered daily by Cloud Scheduler (configure in Google Cloud console)
 * 
 * Cloud Scheduler setup:
 * - Frequency: 0 2 * * * (daily at 2 AM UTC)
 * - Target: HTTPS
 * - URL: https://us-central1-parking-capstone-9778c.cloudfunctions.net/scheduleAnalytics
 * - Auth header: Add OIDC token, use default service account
 */
exports.scheduleAnalytics = functions.https.onRequest(async (req, res) => {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const lotsSnap = await db.collection("lots").get();
    const now = admin.firestore.Timestamp.now();
    const windowDays = 3;
    const start = admin.firestore.Timestamp.fromMillis(
      now.toMillis() - windowDays * 24 * 60 * 60 * 1000
    );

    let processedCount = 0;

    for (const lotDoc of lotsSnap.docs) {
      const lotId = lotDoc.id;
      const lot = lotDoc.data() || {};
      const cap = typeof lot.capacity === "number" ? lot.capacity : null;

      const eventsSnap = await db.collection("lots").doc(lotId)
        .collection("events")
        .where("timestamp", ">=", start)
        .where("timestamp", "<=", now)
        .orderBy("timestamp")
        .get();

      if (eventsSnap.empty) continue;

      const events = eventsSnap.docs.map(d => d.data());

      // Skip if any event missing before/after
      const missing = events.some(e => e.occupancy_before == null || e.occupancy_after == null);
      if (missing) continue;

      const occSeconds = Array(24).fill(0);
      const totalSeconds = Array(24).fill(0);

      const startDate = new Date(start.toMillis());
      const endDate = new Date(now.toMillis());

      function addSegment(t0, t1, occ) {
        let t = new Date(t0);
        while (t < t1) {
          const hour = t.getHours();
          const hourEnd = new Date(t);
          hourEnd.setMinutes(0, 0, 0);
          hourEnd.setHours(hourEnd.getHours() + 1);

          const segEnd = hourEnd < t1 ? hourEnd : t1;
          const secs = (segEnd - t) / 1000;

          occSeconds[hour] += occ * secs;
          totalSeconds[hour] += secs;

          t = segEnd;
        }
      }

      const first = events[0];
      addSegment(startDate, new Date(first.timestamp.toMillis()), Number(first.occupancy_before || 0));

      for (let i = 0; i < events.length - 1; i++) {
        const a = events[i];
        const b = events[i + 1];
        addSegment(
          new Date(a.timestamp.toMillis()),
          new Date(b.timestamp.toMillis()),
          Number(a.occupancy_after || 0)
        );
      }

      const last = events[events.length - 1];
      addSegment(new Date(last.timestamp.toMillis()), endDate, Number(last.occupancy_after || 0));

      const averageByHour = {};
      const averageRateByHour = {};

      for (let h = 0; h < 24; h++) {
        const avgOcc = totalSeconds[h] > 0 ? (occSeconds[h] / totalSeconds[h]) : 0;
        averageByHour[String(h)] = avgOcc;
        averageRateByHour[String(h)] = (cap && cap > 0) ? (avgOcc / cap) * 100 : 0;
      }

      await db.collection("lots").doc(lotId).set(
        {
          historicalData: {
            averageByHour,
            averageRateByHour,
            windowDays,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        },
        { merge: true }
      );

      processedCount++;
    }

    console.log(`Analytics update completed for ${processedCount} lots`);
    return res.status(200).json({ ok: true, lotsProcessed: processedCount });
  } catch (error) {
    console.error("Analytics function error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// ----------- Chatbot OpenAI Proxy (keeps API key secure) -----------

/**
 * POST /chatbot
 * 
 * Proxies OpenAI requests to keep API key secure on server
 * 
 * Body: { prompt: string, parkingData: object }
 * Returns: { ok: true, response: string } or { ok: false, error: string }
 */
exports.chatbot = functions.https.onRequest(
  { secrets: [openaiApiKey] },
  async (req, res) => {
  // Enable CORS for web app
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ ok: false, error: 'prompt is required (string)' });
    }

    // Get OpenAI API key from secret
    const OPENAI_API_KEY = openaiApiKey.value();
    if (!OPENAI_API_KEY) {
      console.error('OpenAI API key not found in secrets');
      return res.status(500).json({ ok: false, error: 'OpenAI API key not configured' });
    }

    console.log('OpenAI API key found, making request...');

    // Call OpenAI API
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API Error:', response.status, errorData);
      return res.status(response.status).json({ 
        ok: false, 
        error: errorData.error?.message || 'OpenAI API error' 
      });
    }

    const data = await response.json();
    
    if (data.choices && data.choices[0]) {
      return res.status(200).json({ 
        ok: true, 
        response: data.choices[0].message.content 
      });
    }

    return res.status(500).json({ ok: false, error: 'Invalid OpenAI response' });

  } catch (error) {
    console.error('Chatbot function error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
});
