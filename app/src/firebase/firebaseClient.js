/******************************************************************************
 * Code Artifact: firebase.js
 * Description:
 * Initializes the Firebase SDK for the web/mobile client. This file 
 * configures the singleton instances for Authentication and Firestore, 
 * ensuring that the app connects to the correct backend services.
 *
 * Implements Requirements:
 * - Req 19: Update garage occupancy count (via Firestore instance)
 * - Req 22: Retrieve real-time occupancy updates in the web app
 * - Req 35: Ensure the website fetches occupancy data from Firestore
 *
 * Programmer: Samantha Adorno
 * Created: 2026-02-10
 * Revision: 2026-03-05 (Added auth persistence and debug logging)
 *
 * Preconditions:
 * - firebaseConfig must be properly exported from ./config.js
 * - Firebase project must be active and Firestore rules configured
 *
 * Inputs:
 * - config: Valid credentials for the Firebase project
 *
 * Outputs:
 * - auth: Firebase Authentication instance
 * - db: Firestore Database instance
 * - googleProvider: OAuth provider for Google Sign-In
 *
 * Side Effects:
 * - Initializes a singleton Firebase App instance if one does not exist
 * - Sets browser-level persistence for authentication states
 ******************************************************************************/

import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { firebaseConfig } from "./config";

// ----------- Firebase Initialization (Req 33/35) -----------

// Prevent multiple app initializations in environments like React Native or Next.js
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// Debug logging to verify configuration alignment in production/development
console.log("FIREBASE CONFIG projectId:", firebaseConfig?.projectId);
console.log("FIREBASE APP options projectId:", app?.options?.projectId);

// ----------- Exported Services -----------

// Firebase Authentication instance
export const auth = getAuth(app);

// Configure how the user's session is stored (local storage persistence)
setPersistence(auth, browserLocalPersistence).catch((e) => {
  console.warn("Auth persistence failed:", e);
});

// Firestore instance for real-time occupancy and event data (Req 22, 35)
export const db = getFirestore(app);

// Provider for authenticated interactions (Req 11/13 context)
export const googleProvider = new GoogleAuthProvider();
