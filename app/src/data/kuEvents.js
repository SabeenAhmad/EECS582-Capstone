import { parkingEvents } from "./parkingEvents";

const KU_EVENTS_FUNCTION_URL =
  "https://us-central1-parking-capstone-9778c.cloudfunctions.net/kuEvents";

// Keeps app-side event shape stable, even if backend payload fields drift.
function sanitizeEvent(event) {
  if (!event || typeof event !== "object") return null;
  if (!event.date || !event.title) return null;

  const safeType =
    event.type === "Basketball" || event.type === "Football" || event.type === "Campus Event"
      ? event.type
      : "Campus Event";
  const safeImpact =
    event.impactLevel === "High" || event.impactLevel === "Medium" || event.impactLevel === "Low"
      ? event.impactLevel
      : "Low";
  const safeLots = Array.isArray(event.lotsAffected) ? event.lotsAffected : [];

  return {
    id: String(event.id || `${event.date}-${event.title}`),
    title: String(event.title),
    type: safeType,
    date: String(event.date).slice(0, 10),
    time: event.time ? String(event.time) : "TBD",
    venue: event.venue ? String(event.venue) : "TBD",
    lotsAffected: safeImpact === "Low" ? [] : safeLots,
    impactLevel: safeImpact,
    notes: event.notes ? String(event.notes) : undefined,
  };
}

export async function fetchKuParkingEvents() {
  try {
    const res = await fetch(KU_EVENTS_FUNCTION_URL);
    if (!res.ok) throw new Error(`kuEvents request failed (${res.status})`);

    const data = await res.json();
    const rawEvents = Array.isArray(data?.events) ? data.events : [];
    const events = rawEvents.map(sanitizeEvent).filter(Boolean);

    if (events.length > 0) return events;
    // If backend returns an empty list, keep UI populated with local fallback.
    return parkingEvents;
  } catch (error) {
    // Network/backend failure fallback keeps calendar/home banner usable.
    console.warn("Falling back to local parking events:", error?.message || error);
    return parkingEvents;
  }
}
