/******************************************************************************
 * Code Artifact: parkingReads.js
 * Description:
 * Data access layer for Firestore reads. Handles fetching individual or 
 * collective parking lot data combined with real-time occupancy status.
 *
 * Implements Requirements:
 * - Req 5 : Ensure the database has accurate parking lot information
 * - Req 22: Retrieve real-time occupancy updates in the web app
 * - Req 23: Display last-updated timestamp in the app
 * - Req 35: Fetch occupancy data from Firestore instead of mock data
 *
 * Programmer: Samantha Adorno
 * Created: April 26, 2026
 * Revision: 2026-04-26 (Added readStatus helper for nested _meta retrieval)
 *
 * Preconditions:
 * - Firestore 'lots' collection exists with valid sub-collections
 *
 * Inputs:
 * - lotId: Unique string identifier for a parking lot
 *
 * Outputs:
 * - Object or Array containing lot metadata and current_status counts
 ******************************************************************************/

import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "./firebaseClient";

// ----------- Helpers -----------

// Req 22/35: Reads the authoritative current occupancy from the _meta sub-collection
async function readStatus(lotId) {
  const statusSnap = await getDoc(doc(db, "lots", lotId, "_meta", "current_status"));
  if (!statusSnap.exists()) {
    return { count_now: 0, last_updated: null };
  }
  const status = statusSnap.data() || {};
  return {
    count_now: status.count_now ?? 0,
    last_updated: status.last_updated ?? null, // Req 23
  };
}

// ----------- Data Fetchers -----------

// Req 5/35: Get ALL lots with live status for the map/list view
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
        averageByHour: lot?.historicalData?.averageByHour || {}, // Req 7 support
        count_now: status.count_now,
        last_updated: status.last_updated,
        permit: lot.permit || "Garage",
      };
    })
  );

  return lots;
}

// Req 22/35: Get details and live status for a single lot
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
