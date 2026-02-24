import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { firebaseConfig } from "./config";

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

console.log("FIREBASE CONFIG projectId:", firebaseConfig?.projectId);
console.log("FIREBASE APP options projectId:", app?.options?.projectId);

export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((e) => {
  console.warn("Auth persistence failed:", e);
});
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();