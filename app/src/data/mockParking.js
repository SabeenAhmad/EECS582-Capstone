// src/data/mockParking.js

/**
 * mockParking.js
 *
 * This file contains mock parking lot data used throughout the app to simulate
 * real-time occupancy trends and provide map + stats functionality. Each lot
 * includes static properties (name, permit type, coordinates) and a timeline
 * of occupancy readings collected throughout the day.
 *
 * FIELD DESCRIPTIONS:
 * - id: Unique identifier for the parking lot.
 * - name: Display name of the lot as it appears on the map and in search.
 * - total: Total number of parking spaces available in the lot.
 * - latitude / longitude: Exact coordinates used to place the lot marker on the map.
 * - permit: The permit color/category required to park in that lot.
 * - dataPoints: Array of time-based occupancy snapshots.
 *      • time: The timestamp of the observation (24-hour format).
 *      • occupied: Number of cars parked at that time (used to calculate availability).
 */


export default [
  {
    id: 1,
    name: 'Allen Fieldhouse Lot',
    total: 60,
    latitude: 38.955414,
    longitude: -95.253775,
    permit: 'Red',
    dataPoints: [
      { time: '07:00', occupied: 10 },
      { time: '07:27', occupied: 18 },
      { time: '08:05', occupied: 24 },
      { time: '08:42', occupied: 38 },
      { time: '09:00', occupied: 48 },
      { time: '09:33', occupied: 55 },
      { time: '10:15', occupied: 58 },
      { time: '10:58', occupied: 60 },
      { time: '11:20', occupied: 59 },
      { time: '11:45', occupied: 57 },
      { time: '12:25', occupied: 54 },
      { time: '13:05', occupied: 50 },
      { time: '13:40', occupied: 45 },
      { time: '14:10', occupied: 38 },
      { time: '15:05', occupied: 32 },
      { time: '16:00', occupied: 22 },
      { time: '17:20', occupied: 12 },
    ],
  },
  {
    id: 2,
    name: 'Mississippi Street Garage',
    total: 100,
    latitude: 38.960689,
    longitude: -95.243439,
    permit: 'Garage',
    dataPoints: [
      { time: '07:00', occupied: 25 },
      { time: '07:18', occupied: 28 },
      { time: '07:43', occupied: 34 },
      { time: '08:00', occupied: 42 },
      { time: '08:37', occupied: 58 },
      { time: '09:10', occupied: 65 },
      { time: '09:50', occupied: 78 },
      { time: '10:05', occupied: 82 },
      { time: '10:48', occupied: 90 },
      { time: '11:05', occupied: 94 },
      { time: '11:22', occupied: 97 },
      { time: '11:50', occupied: 99 },
      { time: '12:15', occupied: 95 },
      { time: '12:48', occupied: 92 },
      { time: '13:20', occupied: 88 },
      { time: '14:05', occupied: 76 },
      { time: '14:47', occupied: 65 },
      { time: '15:10', occupied: 54 },
      { time: '16:00', occupied: 42 },
      { time: '16:30', occupied: 30 },
      { time: '17:05', occupied: 22 },
      { time: '18:00', occupied: 15 },
    ],
  },
  {
    id: 3,
    name: 'Central District Lot',
    total: 80,
    latitude: 38.954495,
    longitude: -95.256091,
    permit: 'Garage',
    dataPoints: [
      { time: '07:15', occupied: 8 },
      { time: '07:50', occupied: 15 },
      { time: '08:10', occupied: 22 },
      { time: '08:30', occupied: 28 },
      { time: '09:10', occupied: 45 },
      { time: '09:50', occupied: 60 },
      { time: '10:25', occupied: 72 },
      { time: '11:05', occupied: 78 },
      { time: '11:35', occupied: 80 },
      { time: '12:10', occupied: 77 },
      { time: '12:45', occupied: 73 },
      { time: '13:30', occupied: 69 },
      { time: '14:05', occupied: 60 },
      { time: '14:45', occupied: 50 },
      { time: '15:10', occupied: 43 },
      { time: '16:00', occupied: 28 },
      { time: '17:05', occupied: 20 },
      { time: '18:05', occupied: 70 },
    ],
  },
  {
    id: 4,
    name: 'Capital Federal Lot',
    total: 300,
    latitude: 38.952318,
    longitude: -95.250001,
    permit: 'Yellow',
    dataPoints: [
      { time: '07:00', occupied: 50 },
      { time: '07:22', occupied: 78 },
      { time: '07:55', occupied: 105 },
      { time: '08:15', occupied: 140 },
      { time: '08:58', occupied: 180 },
      { time: '09:20', occupied: 210 },
      { time: '09:45', occupied: 230 },
      { time: '10:05', occupied: 245 },
      { time: '10:42', occupied: 260 },
      { time: '11:10', occupied: 270 },
      { time: '11:35', occupied: 275 },
      { time: '12:05', occupied: 260 },
      { time: '12:40', occupied: 240 },
      { time: '13:05', occupied: 220 },
      { time: '13:47', occupied: 205 },
      { time: '14:20', occupied: 190 },
      { time: '15:00', occupied: 170 },
      { time: '15:35', occupied: 155 },
      { time: '16:10', occupied: 140 },
      { time: '16:45', occupied: 120 },
      { time: '17:15', occupied: 105 },
      { time: '18:00', occupied: 95 },
    ],
  },
];
