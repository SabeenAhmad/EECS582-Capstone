/*
Names: Samantha Adorno
Date: March 1, 2026
Revision: April, 2026
Description: Provides command-line utilities for managing Firestore parking lot data, including seeding data, updating counts, recording events, and modifying lot metadata.
*/
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Simple arg parsing: supports flags like --serviceAccount=path and positional command
const raw = process.argv.slice(2);
const flags = {};
const positional = [];
for (const a of raw) {
  if (a.startsWith('--')) {
    const [k, v] = a.replace(/^--/, '').split('=');
    flags[k] = v === undefined ? true : v;
  } else {
    positional.push(a);
  }
}

// Default: look for the service account in the local env/ folder (not checked into git)
const SERVICE_ACCOUNT_PATH = flags.serviceAccount || '../env/parking-capstone-9778c-firebase-adminsdk-fbsvc-c1179e192c.json';

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error(`Service account not found at: ${SERVICE_ACCOUNT_PATH}`);
  process.exit(1);
}

const serviceAccount = require(path.resolve(SERVICE_ACCOUNT_PATH));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// Seed lots (same defaults as simulator)
const seedLots = [
  {
    id: 'lot_72',
    data: {
      name: 'Lot 72',
      capacity: 120,
      latitude: 38.954321,
      longitude: -95.255871,
      description: 'Behind Eaton Hall',
    },
  },
  {
    id: 'allen_fieldhouse',
    data: {
      name: 'Allen Fieldhouse Lot',
      capacity: 450,
      latitude: 38.9558,
      longitude: -95.2474,
      description: 'Game-day overflow lot',
    },
  },
  {
    id: 'gsp',
    data: {
      name: 'GSP Lot',
      capacity: 180,
      latitude: 38.95511,
      longitude: -95.24475,
      description: 'Near GSP residence hall',
    },
  },
];

async function seed() {
  for (const lot of seedLots) {
    const ref = db.collection('lots').doc(lot.id);
    await ref.set(lot.data, { merge: true });
    console.log('Seeded', lot.id);
    const statusRef = ref.collection('_meta').doc('current_status');
    await statusRef.set({ count_now: 0, last_updated: admin.firestore.Timestamp.now() }, { merge: true });
  }
  console.log('Seeding complete');
}

async function listLots() {
  const snaps = await db.collection('lots').get();
  snaps.forEach(s => console.log(s.id, s.data()));
}

async function getStatus(lotId) {
  const statusRef = db.collection('lots').doc(lotId).collection('_meta').doc('current_status');
  const snap = await statusRef.get();
  if (!snap.exists) {
    console.log('No status for', lotId);
    return;
  }
  console.log(lotId, snap.data());
}

async function setCount(lotId, count) {
  const statusRef = db.collection('lots').doc(lotId).collection('_meta').doc('current_status');
  await statusRef.set({ count_now: count, last_updated: admin.firestore.Timestamp.now() }, { merge: true });
  console.log(`Set ${lotId} count_now = ${count}`);
}

async function recordEvent(lotId, direction) {
  if (!['ENTRY', 'EXIT'].includes(direction)) throw new Error('direction must be ENTRY or EXIT');
  const lotRef = db.collection('lots').doc(lotId);
  const statusRef = lotRef.collection('_meta').doc('current_status');
  const eventsCol = lotRef.collection('events');

  await db.runTransaction(async (t) => {
    const [lotSnap, statusSnap] = await Promise.all([t.get(lotRef), t.get(statusRef)]);
    if (!lotSnap.exists) throw new Error(`Lot missing: ${lotId}`);
    const lot = lotSnap.data();
    const cap = typeof lot.capacity === 'number' ? lot.capacity : null;
    const current = statusSnap.exists ? statusSnap.data().count_now : 0;

    let delta = direction === 'ENTRY' ? 1 : -1;
    let newCount = current + delta;
    if (newCount < 0) newCount = 0;
    if (cap !== null && newCount > cap) newCount = cap;

    const eventRef = eventsCol.doc();
    const eventData = { timestamp: admin.firestore.Timestamp.now(), direction, source: 'manual', confidence: 1.0 };
    t.set(eventRef, eventData);
    t.set(statusRef, { count_now: newCount, last_updated: admin.firestore.Timestamp.now() }, { merge: true });
    console.log(`Recorded ${direction} for ${lotId}: ${newCount}/${cap === null ? '?' : cap}`);
  });
}

async function updateLotMeta(lotId, updates) {
  const ref = db.collection('lots').doc(lotId);
  await ref.set(updates, { merge: true });
  console.log('Updated lot meta for', lotId);
}

async function deleteLot(lotId) {
  const ref = db.collection('lots').doc(lotId);
  const events = await ref.collection('events').listDocuments();
  for (const d of events) await d.delete();
  await ref.collection('_meta').doc('current_status').delete().catch(() => {});
  await ref.delete();
  console.log('Deleted lot and its events:', lotId);
}

async function help() {
  console.log('Usage: node db_tools.js <command> [--serviceAccount=path] [--lot=lotId] [--count=n] [--field=key] [--value=val]');
  console.log('Commands: seed | list | status | setCount | recordEntry | recordExit | updateLot | deleteLot | help');
}

(async function main() {
  const cmd = positional[0] || flags.command;
  try {
    switch (cmd) {
      case 'seed':
        await seed();
        break;
      case 'list':
        await listLots();
        break;
      case 'status':
        if (!flags.lot) throw new Error('--lot=lotId required');
        await getStatus(flags.lot);
        break;
      case 'setCount':
        if (!flags.lot || typeof flags.count === 'undefined') throw new Error('--lot and --count required');
        await setCount(flags.lot, parseInt(flags.count, 10));
        break;
      case 'recordEntry':
        if (!flags.lot) throw new Error('--lot required');
        await recordEvent(flags.lot, 'ENTRY');
        break;
      case 'recordExit':
        if (!flags.lot) throw new Error('--lot required');
        await recordEvent(flags.lot, 'EXIT');
        break;
      case 'updateLot':
        if (!flags.lot || !flags.field || typeof flags.value === 'undefined') throw new Error('--lot --field --value required');
        await updateLotMeta(flags.lot, { [flags.field]: flags.value });
        break;
      case 'deleteLot':
        if (!flags.lot) throw new Error('--lot required');
        await deleteLot(flags.lot);
        break;
      default:
        await help();
        break;
    }
  } catch (e) {
    console.error('Error:', e.message || e);
    process.exit(1);
  }
  process.exit(0);
})();
