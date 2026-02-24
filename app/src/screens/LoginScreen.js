import React from "react";
import { View, Text, Pressable } from "react-native";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../firebase/firebaseClient";

export default function LoginScreen() {

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