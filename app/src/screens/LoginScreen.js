/******************************************************************************
 * Code Artifact: LoginScreen.js
 * Description:
 * Provides a React Native authentication interface using Firebase Google 
 * Sign-In. Handles the popup-based OAuth flow and basic error reporting.
 *
 * Implements Requirements:
 * - Req 11: Support authenticated states for system interaction
 * - Req 13: Handle authorized/unauthorized states with error feedback
 * - Req 32: Mobile-responsive UI layout (via React Native Flexbox)
 *
 * Programmers: Sriya Annem, Sabeen Ahmad, Anna Ross
 * Created: February 14, 2026
 * Revision: April 26, 2026 (Standardized error handling and styling)
 *
 * Preconditions:
 * - auth and googleProvider must be initialized in firebaseClient.js
 * - Google OAuth must be enabled in the Firebase Console
 *
 * Inputs:
 * - User interaction via the "Sign in with Google" Pressable
 *
 * Outputs:
 * - Successful authentication updates the Firebase Auth state
 *
 * Side Effects:
 * - Triggers a browser/modal popup for Google login
 * - Logs errors to console and alerts the user on failure
 ******************************************************************************/

import React from "react";
import { View, Text, Pressable } from "react-native";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../firebase/firebaseClient";

export default function LoginScreen() {

  /**
   * login
   * Req 13: Invokes the Google Sign-In popup and handles potential auth errors.
   */
  async function login() {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error(e);
      alert("Google sign-in failed");
    }
  }

  return (
    <View style={{ padding: 24 }}>
      {/* Req 32: Basic responsive text and container */}
      <Text style={{ fontSize: 28, marginBottom: 20 }}>
        Parking App Login
      </Text>

      <Pressable
        onPress={login}
        style={{
          backgroundColor: "#4285F4", 
          padding: 12,
          borderRadius: 6,
        }}
      >
        <Text style={{ color: "white", textAlign: "center", fontSize: 16 }}>
          Sign in with Google
        </Text>
      </Pressable>
    </View>
  );
}
