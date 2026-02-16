import { useEffect, useState } from 'react'; // React hooks used for managing state and lifecycle
import mockLots from '../data/mockParking'; // placeholder mock parking data used instead of Firebase


/**
 * TEMP placeholder hook (no Firebase yet)
 * Simulates loading delay so Requirement 28 works.
 *Custom hook providing lots data + loading state.
 */
export function useParkingLots() {

  const [lots, setLots] = useState([]); //tores parking lot data returned to UI
  const [loading, setLoading] = useState(true); //controls loading indicator visibility
  const [error, setError] = useState(null); //holds error state if data load fails


 useEffect(() => { //run once on component mount to simulate data fetching

    // simulate async fetch delay
    const timeout = setTimeout(() => { // create fake network delay using timer
      try {

        setLots(mockLots); // populate state with mock parking data
        setLoading(false); //  stop loading indicator after data is ready

      } catch (e) { // catch unexpected errors during mock fetch

        setError(e); // store error in state so UI can show fallback
        setLoading(false); //stop loading even if error occurs

      }
    }, 1200); // fake loading time (1.2 seconds) to demonstrate loading UI


    return () => clearTimeout(timeout); // leanup timer if component unmounts

  }, []); //empty dependency array ensures effect runs only once

  return { lots, loading, error }; // expose data + loading state to components

}