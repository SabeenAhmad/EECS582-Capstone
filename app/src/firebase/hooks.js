import { useEffect, useState } from "react";

/**
 * useParkingLots
 * Fetches lot metadata + live occupancy from the server.js GET endpoint.
 * Implements: Req 22, 35, 36 and supports Req 28 loading indicator behavior.
 */
export function useParkingLots() {
  const [lots, setLots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;

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
