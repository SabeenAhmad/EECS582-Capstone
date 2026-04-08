import { useEffect, useState } from "react";
import { getLots } from "./parkingReads";
/*
Name: 
Date: , 2026
Description: This file defines a custom React hook that retrieves parking lot data from the backend and manages loading and error states.
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

        const lots = await getLots();
        if (alive) setLots(Array.isArray(lots) ? lots : []);
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