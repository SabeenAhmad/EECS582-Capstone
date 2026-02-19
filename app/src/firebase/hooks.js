import { useEffect, useState } from "react";

/**
 * useParkingLots
 * Fetches lot metadata + live occupancy from GET /api/lots.
 * Supports loading + error states for UI rendering.
 */
export function useParkingLots() {
  const [lots, setLots] = useState([]);      // Array of lot objects
  const [loading, setLoading] = useState(true);  // True while fetching
  const [error, setError] = useState(null);  // Stores fetch errors

  useEffect(() => {
    let alive = true; // Prevent state updates after unmount

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const resp = await fetch("http://localhost:3000/api/lots");
        const json = await resp.json();

        if (!resp.ok || !json?.ok) {
          throw new Error(json?.error || `Failed to load lots (${resp.status})`);
        }

        if (alive) setLots(Array.isArray(json.lots) ? json.lots : []);
      } catch (e) {
        if (alive) setError(e);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  return { lots, loading, error };
}