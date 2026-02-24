/**
 * StatsPage
 *
 * Displays detailed information for a selected parking lot:
 * - Live occupancy count (via Firebase-backed GET endpoint)
 * - Occupancy percentage visualization
 * - Permit badge
 * - Last updated timestamp
 * - Hourly average occupancy chart
 *
 * Requirements:
 *  - Req 36: Website fetches occupancy via Firebase GET endpoint (no mock data)
 *  - Real-time updates supported via manual refresh (1–3s typical latency)
 *
 * Notes:
 *  - All occupancy values come from Firestore through the Express API
 *  - averageByHour is derived from Firestore historical data
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
import { getLot } from "../src/firebase/parkingReads";

/**
 * Local Express API base.
 * This server reads directly from Firestore (read-only).
 */


/**
 * Normalizes Firestore timestamps or ISO strings into JS Date.
 */
function parseMaybeDate(v) {
  if (!v) return null;
  if (typeof v === "string") return new Date(v);
  if (v?.seconds) return new Date(v.seconds * 1000);
  return new Date();
}

export default function StatsPage() {
  /**
   * Extract lotId from URL query parameter.
   * Expected format: /StatsPage?lot=lot-1
   */
  const { lot } = useLocalSearchParams();
  const router = useRouter();
  const { theme, colors } = useTheme();
  const { width } = useWindowDimensions();
  const isSmall = width < 700;

  /**
   * Load fonts before rendering UI to prevent layout shift.
   */
  const [fontsLoaded] = useFonts({
    Poppins_600SemiBold,
    Inter_400Regular,
    Inter_600SemiBold,
  });

  /**
   * Local state for lot data and loading status.
   */
  const [lotData, setLotData] = useState(null);
  const [lotLoading, setLotLoading] = useState(true);
  const [lotError, setLotError] = useState(null);

  const lotId = typeof lot === "string" ? lot : "";

  /**
   * Fetch lot metadata + live occupancy from backend.
   * This endpoint is Firebase-backed (Req 36).
   */
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

      const lotDoc = await getLot(lotId);
      setLotData(lotDoc);
    } catch (e) {
      setLotError(e.message || String(e));
      setLotData(null);
    } finally {
      setLotLoading(false);
    }


  }, [lotId]);

  /**
   * Initial fetch on mount or when lotId changes.
   */
  useEffect(() => {
    fetchLot();
  }, [fetchLot]);

  /**
   * Derived occupancy metrics.
   * These are computed with safe fallbacks to avoid undefined errors.
   */
  const occupied =
    typeof lotData?.count_now === "number" ? lotData.count_now : 0;

  const capacity =
    typeof lotData?.capacity === "number" ? lotData.capacity : 0;

  const percentFull =
    capacity > 0 ? (occupied / capacity) * 100 : 0;

  const permitType = lotData?.permit || "Garage";
  const lastUpdated = parseMaybeDate(lotData?.last_updated);

  /**
   * Compute hourly occupancy percentage from Firestore averageByHour map.
   * averageByHour structure:
   * { "7": 14, "8": 31, ... }  -> occupancy count
   * Converted to percentage for chart display.
   */
  const hourlyData = useMemo(() => {
    const data = new Array(24).fill(0);

    const avg = lotData?.averageByHour || {};
    for (const [hourStr, occ] of Object.entries(avg)) {
      const hour = parseInt(hourStr, 10);
      if (Number.isNaN(hour) || hour < 0 || hour > 23) continue;

      const occNum = typeof occ === "number" ? occ : 0;
      const rate =
        capacity > 0 ? (occNum / capacity) * 100 : 0;

      data[hour] = rate;
    }

    return data;
  }, [lotData, capacity]);

  // ---------------- Loading Guards ----------------

  if (!fontsLoaded) return null;

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

  /**
   * Color thresholds for occupancy visualization.
   * Low < 40%, Medium 40–69%, High ≥ 70%.
   */
  let barColor = "#9AE29B";
  if (percentFull >= 70) barColor = "#FF9C9C";
  else if (percentFull >= 40) barColor = "#FFE57E";

  const colorsByPermit = {
    Green: { bg: "#C8FACC", border: "#8DD493" },
    Yellow: { bg: "#FFF7A3", border: "#E8D87A" },
    Red: { bg: "#FBC7C7", border: "#E89898" },
    Garage: { bg: "#DDE1E7", border: "#B0B8C2" },
  };

  const permitColors =
    colorsByPermit[permitType] || colorsByPermit.Garage;

  const progressBg =
    theme === "dark" ? "#222430" : "#F2F1E9";

  const progressBorder =
    theme === "dark" ? "#343846" : "#E0DECE";

  // ---------------- Render ----------------

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingTop: isSmall ? 80 : 100,
        paddingHorizontal: isSmall ? 20 : 40,
        paddingBottom: 40,
      }}
    >
      {/* Navigation Back Button */}
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

      {/* Lot Title */}
      <View style={styles.titleContainer}>
        <Text style={styles.title}>
          {lotData.displayName || lotData.name || lotData.id}
        </Text>
      </View>

      {/* Occupancy Progress Bar */}
      <View
        style={[
          styles.progressContainer,
          { backgroundColor: progressBg, borderColor: progressBorder },
        ]}
      >
        <View
          style={[
            styles.progressFill,
            {
              width: `${Math.min(100, Math.max(0, percentFull))}%`,
              backgroundColor: barColor,
            },
          ]}
        />
      </View>

      {/* Occupancy Info Row */}
      <View style={[styles.topRowContainer, isSmall && styles.topRowContainerSmall]}>
        <View style={styles.leftColumn}>
          <Text style={[styles.infoText, { color: colors.text }]}>
            {occupied}/{capacity} spots taken
          </Text>

          <View
            style={[
              styles.permitTag,
              {
                backgroundColor: permitColors.bg,
                borderColor: permitColors.border,
              },
            ]}
          >
            <Text style={styles.permitText}>
              {permitType} Permit
            </Text>
          </View>
        </View>

        <View style={[styles.rightColumn, isSmall && styles.rightColumnSmall]}>
          <Text style={[styles.infoText, { color: colors.text }]}>
            Last updated:{" "}
            {lastUpdated
              ? lastUpdated.toLocaleTimeString()
              : "Unknown"}
          </Text>

          {/* Manual refresh for near-real-time updates */}
          <Text
            style={[
              styles.refreshButton,
              {
                backgroundColor:
                  theme === "dark" ? "#4EA1FF" : "#0073e6",
              },
            ]}
            onPress={fetchLot}
          >
            ↻ Refresh
          </Text>
        </View>
      </View>

      {/* Hourly Chart */}
      <View style={styles.chartContainer}>
        <Text
          style={[styles.chartTitle, { color: colors.text }]}
        >
          Busy Hours
        </Text>
        <PopularTimes
          data={hourlyData}
          maxCapacity={capacity}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
  progressFill: {
    height: "100%",
    borderRadius: 12,
  },
  infoText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  permitTag: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  permitText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#000",
  },
  homeButtonContainer: {
    position: "absolute",
    top: 30,
    right: 20,
    zIndex: 10,
  },
  topRowContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    width: "100%",
    marginTop: 12,
  },
  topRowContainerSmall: {
    flexDirection: "column",
    gap: 12,
  },
  leftColumn: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 10,
  },
  rightColumn: {
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 10,
  },
  rightColumnSmall: {
    alignItems: "flex-start",
  },
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
  chartContainer: {
    marginTop: 30,
    marginBottom: 40,
  },
  chartTitle: {
    fontSize: 32,
    fontFamily: "Poppins_600SemiBold",
    marginBottom: 15,
  },
});