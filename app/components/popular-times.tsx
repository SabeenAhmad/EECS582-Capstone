import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';

interface PopularTimesProps {
  data: number[];
  currentHour?: number;
  maxCapacity: number;
}

const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const HOURS_TO_SHOW = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

const formatHourLabel = (hour: number) => {
  if (hour === 0) return '12AM';
  if (hour === 12) return '12PM';
  if (hour < 12) return `${hour}AM`;
  return `${hour - 12}PM`;
};

export const PopularTimes: React.FC<PopularTimesProps> = ({
  data,
  currentHour = new Date().getHours(),
  maxCapacity,
}) => {
  const { width } = useWindowDimensions();
  // Compact layout for phones/smaller viewports.
  const isSmall = width < 700;
  const values = HOURS_TO_SHOW.map((h) => data[h] ?? 0);
  const chartHeight = 180;

  return (
    <View style={styles.container}>
      {/* WEEKDAY ROW */}
      <View style={styles.daysContainer}>
        {days.map((day, index) => (
          <Text
            key={day}
            style={[
              styles.dayText,
              index === new Date().getDay() && styles.currentDay,
            ]}
          >
            {day}
          </Text>
        ))}
      </View>

      {/* GRAPH ROW */}
      <View style={styles.graphRow}>
        {/* Y-axis labels */}
        <View style={styles.yAxisContainer}>
          <Text style={styles.yAxisLabel}>{maxCapacity}</Text>
          <Text style={styles.yAxisLabel}>{Math.round(maxCapacity * 0.75)}</Text>
          <Text style={styles.yAxisLabel}>{Math.round(maxCapacity * 0.5)}</Text>
          <Text style={styles.yAxisLabel}>{Math.round(maxCapacity * 0.25)}</Text>
          <Text style={styles.yAxisLabel}>0</Text>
        </View>

        {/* Bars + axis lines */}
        <View style={[styles.chartArea, { height: chartHeight + 40 }]}>
          {/* Y axis */}
          <View style={[styles.yAxisLine, { height: chartHeight }]} />

          <View style={[styles.barsContainer, { height: chartHeight }]}>
            {values.map((pct, idx) => {
              const hour = HOURS_TO_SHOW[idx];
              const actual = (pct / 100) * maxCapacity;
              const barHeight =
                maxCapacity === 0 ? 0 : (actual / maxCapacity) * chartHeight;
              // On small screens, render every other x-axis label to avoid overlap.
              const showLabel = !isSmall || idx % 2 === 0;

              // color-coded
              let barColor = '#9AE29B';
              if (pct >= 70) barColor = '#FF9C9C';
              else if (pct >= 40) barColor = '#FFE57E';

              const isCurrent = hour === currentHour;

              return (
                <View key={hour} style={styles.barWrapper}>
                  <View
                    style={[
                      styles.bar,
                      {
                        width: isSmall ? 20 : 30,
                        height: barHeight,
                        backgroundColor: barColor,
                        borderWidth: isCurrent ? 1.5 : 0,
                        borderColor: isCurrent ? '#333' : 'transparent',
                      },
                    ]}
                  />
                  {/* Keep label space reserved even when text is hidden so all bars share the same baseline. */}
                  <Text style={[styles.timeLabel, !showLabel && styles.timeLabelHidden]}>
                    {formatHourLabel(hour)}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* X axis */}
          <View style={styles.xAxisLine} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: '#FAF9F4',
    borderRadius: 8,
    marginVertical: 8,
  },

  /** ——— WEEKDAY ROW ——— */
  daysContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 28,
    paddingHorizontal: 4,
  },
  dayText: {
    color: '#777',
    fontSize: 12,
  },
  currentDay: {
    color: '#000',
    fontWeight: '600',
  },

  /** ——— GRAPH ——— */
  graphRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 10, 
  },
  yAxisContainer: {
    justifyContent: 'space-between',
    height: 180,
    paddingRight: 8,
  },
  yAxisLabel: {
    fontSize: 12,
    color: '#555',
    textAlign: 'right',
  },
  chartArea: {
    flex: 1,
    position: 'relative',
  },
  yAxisLine: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 1,
    backgroundColor: '#ddd',
  },
  xAxisLine: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#ddd',
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingLeft: 10,
  },
  barWrapper: {
    alignItems: 'center',
    flex: 1,
  },
  bar: {
    width: 30,
    borderRadius: 4,
  },
  timeLabel: {
    marginTop: 6,
    fontSize: 11,
    // Fixed metrics prevent alternating columns from shifting vertically.
    lineHeight: 14,
    height: 14,
    color: '#333',
    textAlign: 'center',
  },
  timeLabelHidden: {
    // Hide text while preserving layout space.
    opacity: 0,
  },
});

export default PopularTimes;
