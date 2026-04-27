/******************************************************************************
 * Code Artifact: useParkingLots.js
 * Description:
 * Custom React hook for fetching and managing parking lot state. It handles
 * the lifecycle of the data request, including loading and error states.
 *
 * Implements Requirements:
 * - Req 28: Display a loading indicator in the web app
 * - Req 29: Show a fallback message when data is unavailable (via error state)
 * - Req 35: Fetch occupancy data from Firestore instead of mock data
 *
 * Programmer: Samantha Adorno
 * Created: March 2, 2026
 * Revision: 2026-04-26 (Added prologue)
 *
 * Preconditions:
 * - getLots must be correctly implemented in ./parkingReads
 *
 * Outputs:
 * - lots: Array of lot data
 * - loading: Boolean fetch status (Req 28)
 * - error: Object containing fetch failures (Req 29)
 ******************************************************************************/

import { useEffect, useState } from "react";
import { getLots } from "./parkingReads";

export function useParkingLots() {
  const [lots, setLots] = useState([]);         // Req 35: Live data storage
  const [loading, setLoading] = useState(true);  // Req 28: Loading state
  const [error, setError] = useState(null);      // Req 29: Error tracking

  useEffect(() => {
    let alive = true; // Cleanup flag to prevent memory leaks

    async function load() {
      try {
        setLoading(true);
        setError(null);

        // Fetching real-time data from Firestore
        const lots = await getLots();
        
        if (alive) {
          setLots(Array.isArray(lots) ? lots : []);
        }
      } catch (e) {
        if (alive) setError(e); // Handle data unavailability
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
