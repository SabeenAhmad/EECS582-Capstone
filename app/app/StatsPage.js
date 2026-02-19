/**
 * StatsPage
 *
 * Displays detailed information for a selected parking lot:
 * - Current occupancy and percent full (LIVE via GET endpoint)
 * - Permit type badge (from local metadata for now)
 * - "Last updated" timestamp with refresh button (from server when available)
 * - Busy-hour chart (still derived from local historical mock until backend provides history)
 *
 * Requirements:
 * Req 36: Website fetches occupancy via this GET endpoint instead of mock data
 * Data is dynamically themed based on light/dark mode.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFonts, Poppins_600SemiBold } from "@expo-google-fonts/poppins";
import { Inter_400Regular, Inter_600SemiBold } from "@expo-google-fonts/inter";

import PopularTimes from "../components/popular-times";
import { useTheme } from "./context/ThemeContext";

const LOCAL_BASE = "http://localhost:3000";
// Remove remote until you deploy the same Express API there.
// const REMOTE_BASE = "https://event-248486536721.us-central1.run.app";

function parseMaybeDate(v) {
  if (!v) return null;
  if (typeof v === "string") return new Date(v);
  if (v?.seconds) return new Date(v.seconds * 1000);
  return new Date();
}

export default function StatsPage() {
  const { lot } = useLocalSearchParams();
  const router = useRouter();
  const { theme, colors } = useTheme();
  const { width } = useWindowDimensions();
  const isSmall = width < 700;

  const [fontsLoaded] = useFonts({
    Poppins_600SemiBold,
    Inter_400Regular,
    Inter_600SemiBold,
  });

  const [lotData, setLotData] = useState(null);
  const [lotLoading, setLotLoading] = useState(true);
  const [lotError, setLotError] = useState(null);

  const lotId = typeof lot === "string" ? lot : "";

  const fetchLot = useCallback(async () => {
    if (!lotId) {
      setLotError("Lot not specified in the URL.");
      setLotData(null);
      setLotLoading(false);
      return;
    }

    try {
      setLotLoading(true);
      setLotError(null);

      const encoded = encodeURIComponent(lotId);
      const url = `${LOCAL_BASE}/api/lot/${encoded}`;

      const resp = await fetch(url, { method: "GET" });

      // safer than resp.json() when server returns HTML error pages
      const text = await resp.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }

      if (!resp.ok || !json?.ok || !json?.lot) {
        throw new Error(json?.error || `Failed to fetch lot (${resp.status}): ${text.slice(0, 120)}`);
      }

      setLotData(json.lot);
    } catch (e) {
      setLotError(e.message || String(e));
      setLotData(null);
    } finally {
      setLotLoading(false);
    }
  }, [lotId]);

  useEffect(() => {
    fetchLot();
  }, [fetchLot]);

  // Compute these with safe defaults BEFORE early returns (no conditional hooks)
  const occupied = typeof lotData?.count_now === "number" ? lotData.count_now : 0;
  const capacity = typeof lotData?.capacity === "number" ? lotData.capacity : 0;
  const percentFull = capacity > 0 ? (occupied / capacity) * 100 : 0;

  const permitType = lotData?.permit || "Garage";
  const lastUpdated = parseMaybeDate(lotData?.last_updated);

  const hourlyData = useMemo(() => {
  const data = new Array(24).fill(0);

  const avg = lotData?.averageByHour || {}; // map: hour -> avg occupancy count
  for (const [hourStr, occ] of Object.entries(avg)) {
    const hour = parseInt(hourStr, 10);
    if (Number.isNaN(hour) || hour < 0 || hour > 23) continue;

    const occNum = typeof occ === "number" ? occ : 0;
    const rate = capacity > 0 ? (occNum / capacity) * 100 : 0;
    data[hour] = rate;
  }

  return data;
}, [lotData, capacity]);

  // Guard: fonts
  if (!fontsLoaded) return null;

  // Loading state
  if (lotLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: 100 }]}>
        <ActivityIndicator />
        <Text style={{ color: colors.text, textAlign: "center", marginTop: 10 }}>
          Loading lot...
        </Text>
      </View>
    );
  }

  // Not found / error state
  if (!lotData) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: 100 }]}>
        <Text style={{ color: colors.text, textAlign: "center" }}>
          {lotError ? `Lot not found: ${lotError}` : "Lot not found"}
        </Text>

        <Text
          style={[
            styles.refreshButton,
            {
              marginTop: 16,
              alignSelf: "center",
              backgroundColor: theme === "dark" ? "#4EA1FF" : "#0073e6",
            },
          ]}
          onPress={fetchLot}
        >
          ↻ Retry
        </Text>
      </View>
    );
  }

  // Color coding
  let barColor = "#9AE29B";
  if (percentFull >= 70) barColor = "#FF9C9C";
  else if (percentFull >= 40) barColor = "#FFE57E";

  const colorsByPermit = {
    Green: { bg: "#C8FACC", border: "#8DD493" },
    Yellow: { bg: "#FFF7A3", border: "#E8D87A" },
    Red: { bg: "#FBC7C7", border: "#E89898" },
    Garage: { bg: "#DDE1E7", border: "#B0B8C2" },
  };
  const permitColors = colorsByPermit[permitType] || colorsByPermit.Garage;

  const progressBg = theme === "dark" ? "#222430" : "#F2F1E9";
  const progressBorder = theme === "dark" ? "#343846" : "#E0DECE";

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingTop: isSmall ? 80 : 100,
        paddingHorizontal: isSmall ? 20 : 40,
        paddingBottom: 40,
      }}
    >
      <View style={styles.homeButtonContainer}>
        <Text
          style={[
            styles.homeButton,
            { backgroundColor: colors.buttonBackground, color: colors.buttonText },
          ]}
          onPress={() => router.push("/")}
        >
          ← Back to Home
        </Text>
      </View>

      <View style={styles.titleContainer}>
        <Text style={styles.title}>{lotData.name || lotData.id}</Text>
      </View>

      <View style={[styles.progressContainer, { backgroundColor: progressBg, borderColor: progressBorder }]}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.min(100, Math.max(0, percentFull))}%`, backgroundColor: barColor },
          ]}
        />
      </View>

      <View style={[styles.topRowContainer, isSmall && styles.topRowContainerSmall]}>
        <View style={styles.leftColumn}>
          <Text style={[styles.infoText, { color: colors.text }]}>
            {occupied}/{capacity} spots taken
          </Text>

          <View style={[styles.permitTag, { backgroundColor: permitColors.bg, borderColor: permitColors.border }]}>
            <Text style={styles.permitText}>{permitType} Permit</Text>
          </View>
        </View>

        <View style={[styles.rightColumn, isSmall && styles.rightColumnSmall]}>
          <Text style={[styles.infoText, { color: colors.text }]}>
            Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : "Unknown"}
          </Text>

          <Text
            style={[
              styles.refreshButton,
              { backgroundColor: theme === "dark" ? "#4EA1FF" : "#0073e6" },
            ]}
            onPress={fetchLot}
          >
            ↻ Refresh
          </Text>
        </View>
      </View>

      <View style={styles.chartContainer}>
        <Text style={[styles.chartTitle, { color: colors.text }]}>Busy Hours</Text>
        <PopularTimes data={hourlyData} maxCapacity={capacity} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: {
    fontSize: 42,
    fontFamily: "Poppins_600SemiBold",
    textAlign: "left",
    marginBottom: 25,
  },
  progressContainer: {
    width: "100%",
    height: 20,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
  },
  progressFill: { height: "100%", borderRadius: 12 },
  infoText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  permitTag: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  permitText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#000" },
  homeButtonContainer: { position: "absolute", top: 30, right: 20, zIndex: 10 },
  topRowContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    width: "100%",
    marginTop: 12,
  },
  topRowContainerSmall: { flexDirection: "column", gap: 12 },
  leftColumn: { flexDirection: "column", alignItems: "flex-start", gap: 10 },
  rightColumn: { flexDirection: "column", alignItems: "flex-end", gap: 10 },
  rightColumnSmall: { alignItems: "flex-start" },
  homeButton: {
    fontFamily: "Inter_600SemiBold",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    fontSize: 15,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  refreshButton: {
    fontFamily: "Inter_600SemiBold",
    color: "white",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    fontSize: 15,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
    textAlign: "center",
    minWidth: 100,
  },
  chartContainer: { marginTop: 30, marginBottom: 40 },
  chartTitle: { fontSize: 32, fontFamily: "Poppins_600SemiBold", marginBottom: 15 },
});
