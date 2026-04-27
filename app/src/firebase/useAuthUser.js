/******************************************************************************
 * Code Artifact: useAuthUser.js
 * Description:
 * Provides a custom React hook that listens for Firebase authentication state 
 * changes. This ensures the app can handle authenticated writes and 
 * identity-based features like the parking chatbot.
 *
 * Implements Requirements:
 * - Req 11: Support authenticated state for HTTP POST requests
 * - Req 13: Reject unauthorized or malformed requests with clear error responses
 *
 * Programmer: Samantha Adorno
 * Created: March 3, 2026
 * Revision: April 26, 2026 (Added comments)
 *
 * Preconditions:
 * - auth instance must be initialized in ./firebaseClient
 *
 * Outputs:
 * - user: The current Firebase User object or null
 * - authLoading: Boolean indicating if the auth state is still being determined
 ******************************************************************************/

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebaseClient";

/**
 * useAuthUser
 * Listens for Firebase authentication state changes.
 * Returns current user + loading flag.
 */
export function useAuthUser() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    // Req 13
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });

    // Cleanup subscription on unmount
    return unsubscribe;
  }, []);

  return { user, authLoading };
}
