import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "./firebaseClient";

// Read current status doc
async function readStatus(lotId) {
  const statusSnap = await getDoc(doc(db, "lots", lotId, "_meta", "current_status"));
  if (!statusSnap.exists()) {
    return { count_now: 0, last_updated: null };
  }
  const status = statusSnap.data() || {};
  return {
    count_now: status.count_now ?? 0,
    last_updated: status.last_updated ?? null,
  };
}

// Get ALL lots + live status
export async function getLots() {
  const snap = await getDocs(collection(db, "lots"));

  const lots = await Promise.all(
    snap.docs.map(async (d) => {
      const lot = d.data() || {};
      const lotId = d.id;

      const status = await readStatus(lotId);

      return {
        id: lotId,
        name: lot.displayName || lot.name || lotId,
        latitude: lot.latitude,
        longitude: lot.longitude,
        capacity: lot.capacity ?? 0,
        description: lot.description || "",
        averageByHour: lot?.historicalData?.averageByHour || {},
        count_now: status.count_now,
        last_updated: status.last_updated,
        permit: lot.permit || "Garage",
      };
    })
  );

  return lots;
}

// Get one lot + live status
export async function getLot(lotId) {
  const lotSnap = await getDoc(doc(db, "lots", lotId));
  const lot = lotSnap.exists() ? (lotSnap.data() || {}) : {};

  const status = await readStatus(lotId);

  return {
    id: lotId,
    name: lot.displayName || lot.name || lotId,
    rawName: lot.name || null,
    displayName: lot.displayName || null,
    capacity: lot.capacity ?? 0,
    permit: lot.permit || "Garage",
    description: lot.description || "",
    latitude: lot.latitude,
    longitude: lot.longitude,
    averageByHour: lot?.historicalData?.averageByHour || {},
    count_now: status.count_now,
    last_updated: status.last_updated,
  };
}