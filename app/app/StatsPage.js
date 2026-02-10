<<<<<<< HEAD
/**
 * StatsPage
 *
 * Displays detailed information for a selected parking lot:
 * - Current occupancy and percent full
 * - Permit type badge
 * - "Last updated" timestamp with refresh button
 * - Busy-hour chart derived from historical time-series data
 *
 * Data is dynamically themed based on light/dark mode.
 */
=======
>>>>>>> f7e9bd37e3cc75168c499bc51d82667739b388e1

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFonts, Poppins_600SemiBold } from '@expo-google-fonts/poppins';
import { Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';

import lots from '../src/data/mockParking';
import PopularTimes from '../components/popular-times';
import { useTheme } from './context/ThemeContext'; 

export default function StatsPage() {

  /** Extract selected lot name from route params */
  const { lot } = useLocalSearchParams();

  /** Find the full matching lot object */
  const lotData = lots.find((l) => l.name === lot);

  const router = useRouter();
  const { theme, colors } = useTheme(); 

  /** Load required fonts */
  const [fontsLoaded] = useFonts({
    Poppins_600SemiBold,
    Inter_400Regular,
    Inter_600SemiBold,
  });

  /** Stores the "last updated" timestamp, refreshed manually */
  const [lastUpdatedTime, setLastUpdatedTime] = useState(new Date());

  /** If fonts aren't loaded yet, don't render */
  if (!fontsLoaded) return null;

  /** Handle missing lot gracefully */
  if (!lotData) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: 100 }]}>
        <Text style={{ color: colors.text, textAlign: 'center' }}>Lot not found</Text>
      </View>
    );
  }

  // ------------------------------------------
  // Extract latest occupancy metrics
  // ------------------------------------------

  /** Get the most recent datapoint from the lot's dataset */
  const latest = lotData.dataPoints[lotData.dataPoints.length - 1];

  const occupied = latest.occupied;
  const percentFull = (occupied / lotData.total) * 100;
  const permitType = lotData.permit;
  const getHourlyData = () => {
    const data = new Array(24).fill(0);
    lotData.dataPoints.forEach((point) => {
      const hour = parseInt(point.time.split(':')[0], 10);
      const occupancyRate = (point.occupied / lotData.total) * 100;
      data[hour] = occupancyRate;
    });
    return data;
  };

  // ------------------------------------------
  // Convert raw datapoints → hourly occupancy array
  // Used by the PopularTimes chart component
  // ------------------------------------------

  const getHourlyData = () => {
    const data = new Array(24).fill(0);

    lotData.dataPoints.forEach((point) => {
      const hour = parseInt(point.time.split(':')[0], 10);
      const occupancyRate = (point.occupied / lotData.total) * 100;
      data[hour] = occupancyRate;
    });

    return data;
  };

  const hourlyData = getHourlyData();

  // ------------------------------------------
  // Dynamic color coding depending on percent full
  // ------------------------------------------

  let barColor = '#9AE29B';        // Low occupancy → greenish
  if (percentFull >= 70) barColor = '#FF9C9C';       // 70%+ → red
  else if (percentFull >= 40) barColor = '#FFE57E';  // 40%+ → yellow

  // ------------------------------------------
  // Traffic-light style permit color mapping
  // ------------------------------------------

  const colorsByPermit = {
    Green:  { bg: '#C8FACC', border: '#8DD493' },
    Yellow: { bg: '#FFF7A3', border: '#E8D87A' },
    Red:    { bg: '#FBC7C7', border: '#E89898' },
    Garage: { bg: '#DDE1E7', border: '#B0B8C2' },
  };

  /** Fallback to the Garage style if permit type is missing */
  const permitColors = colorsByPermit[permitType] || colorsByPermit.Garage;

  // ------------------------------------------
  // Theme-aware progress bar styling
  // ------------------------------------------

  const progressBg = theme === 'dark' ? '#222430' : '#F2F1E9';
  const progressBorder = theme === 'dark' ? '#343846' : '#E0DECE';

  // ------------------------------------------
  // Render UI
  // ------------------------------------------

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: 100, paddingHorizontal: 40, paddingBottom: 40 }}
    >

      {/* Navigation back to Home */}
      <View style={styles.homeButtonContainer}>
        <Text
          style={[
            styles.homeButton,
            { backgroundColor: colors.buttonBackground, color: colors.buttonText },
          ]}
          onPress={() => router.push('/')}
        >
          ← Back to Home
        </Text>
      </View>

<<<<<<< HEAD
      {/* Lot Title */}
      <Text style={[styles.title, { color: colors.text }]}>
        {lotData.name}
      </Text>
=======
        {/* Title */}
        <View style={styles.titleContainer}>
          <Text style={styles.title}>{lotData.name}</Text>
        </View>
>>>>>>> f7e9bd37e3cc75168c499bc51d82667739b388e1

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
            { width: `${percentFull}%`, backgroundColor: barColor },
          ]}
        />
      </View>

      {/* Top Summary Row */}
      <View style={styles.topRowContainer}>

        {/* LEFT COLUMN: occupancy + permit type */}
        <View style={styles.leftColumn}>
          <Text style={[styles.infoText, { color: colors.text }]}>
            {occupied}/{lotData.total} spots taken
          </Text>

          {/* Permit Type Badge */}
          <View
            style={[
              styles.permitTag,
              { backgroundColor: permitColors.bg, borderColor: permitColors.border },
            ]}
          >
            <Text style={styles.permitText}>{permitType} Permit</Text>
          </View>
        </View>

        {/* RIGHT COLUMN: last updated + refresh button */}
        <View style={styles.rightColumn}>
          <Text style={[styles.infoText, { color: colors.text }]}>
            Last updated: {lastUpdatedTime.toLocaleTimeString()}
          </Text>

          <Text
            style={[
              styles.refreshButton,
              { backgroundColor: theme === 'dark' ? '#4EA1FF' : '#0073e6' },
            ]}
            onPress={() => setLastUpdatedTime(new Date())}
          >
            ↻ Refresh
          </Text>
        </View>
      </View>

      {/* Popular Times Histogram */}
      <View style={styles.chartContainer}>
        <Text style={[styles.chartTitle, { color: colors.text }]}>
          Busy Hours
        </Text>

        {/** Visual chart component using hourly occupancy array */}
        <PopularTimes data={hourlyData} maxCapacity={lotData.total} />
      </View>

    </ScrollView>
  );
}

// ------------------------------------------
// Styles
// ------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  title: {
    fontSize: 42,
    fontFamily: 'Poppins_600SemiBold',
    textAlign: 'left',
    marginBottom: 25,
  },

  progressContainer: {
    width: '100%',
    height: 20,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
  },

  progressFill: {
    height: '100%',
    borderRadius: 12,
  },

  infoText: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
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
    fontFamily: 'Inter_600SemiBold',
    color: '#000',
  },

  homeButtonContainer: {
    position: 'absolute',
    top: 30,
    right: 20,
    zIndex: 10,
  },

  topRowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    width: '100%',
    marginTop: 12,
  },

  leftColumn: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 10,
  },

  rightColumn: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 10,
  },

  homeButton: {
    fontFamily: 'Inter_600SemiBold',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    fontSize: 15,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },

  refreshButton: {
    fontFamily: 'Inter_600SemiBold',
    color: 'white',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    fontSize: 15,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
    textAlign: 'center',
    minWidth: 100,
  },

  chartContainer: {
    marginTop: 30,
    marginBottom: 40,
  },

  chartTitle: {
    fontSize: 32,
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 15,
  },
});
