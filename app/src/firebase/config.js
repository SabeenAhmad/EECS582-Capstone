/******************************************************************************
 * Code Artifact: firebaseConfig.js
 * Description:
 * Centralized configuration loader for Firebase. This module handles 
 * environment variable resolution for the frontend/mobile application, 
 * supporting both Expo public variables and local JSON fallbacks.
 *
 * Implements Requirements:
 * - Req 33: Host web server on Firebase (Configuration support)
 * - Req 35: Fetch occupancy data from Firestore instead of mock data
 *
 * Programmer: Samantha Adorno
 * Revision: 2026-02-10 (Standardized env var naming to EXPO_PUBLIC_*)
 * Revision: 2026-02-28 (Added strict validation for required keys)
 * Revision: 2026-04-26 (Added prologue)
 *
 * Preconditions:
 * - Environment variables must be prefixed with EXPO_PUBLIC_ for client access
 * - Or, a valid firebase-config.json must exist in the ../../env/ directory
 *
 * Side Effects:
 * - Logs errors to console if required configuration keys are missing
 *
 * Invariants:
 * - The firebaseConfig object is exported even if empty to prevent import crashes
 ******************************************************************************/

let firebaseConfig = {};

try {
  // Prefer explicit EXPO_PUBLIC_* env vars (secure for publishing)
  // Req 35: Ensures connection to live Firestore DB
  if (process.env.EXPO_PUBLIC_FIREBASE_APIKEY) {
    firebaseConfig = {
      apiKey: process.env.EXPO_PUBLIC_FIREBASE_APIKEY,
      authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTHDOMAIN,
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECTID,
      storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGEBUCKET,
      messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGINGSENDERID,
      appId: process.env.EXPO_PUBLIC_FIREBASE_APPID,
      measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENTID
    };
  } else {
    try {
      // Fallback for local development environments
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const cfg = require('../../env/firebase-config.json');
      firebaseConfig = cfg || {};
    } catch (e) {
      console.warn('Firebase config not found in env/ and EXPO_PUBLIC_* vars are not set.');
      firebaseConfig = {};
    }
  }
}
catch (e) {
  // In some runtimes (e.g. Metro) process.env may be undefined — ensure we don't crash
  console.warn('Error loading firebase config:', e?.message || e);
  firebaseConfig = {};
}

export { firebaseConfig };

// ----------- Configuration Validation (Req 35) -----------

// Validate required Firebase configuration keys to ensure database connectivity
const requiredKeys = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId'
];

for (const key of requiredKeys) {
  if (!firebaseConfig[key]) {
    // Req 13/35: Provide clear error feedback for system configuration issues
    console.error(`Missing required Firebase configuration: ${key}`);
    console.error('Please set the following environment variables in your .env file:');
    console.error(`EXPO_PUBLIC_FIREBASE_${key.toUpperCase()}`);
  }
}
