/** 
 * Imports core React features, navigation, and React Native components.
 * Also loads mock parking lot data and gets device screen dimensions.
 */
import React, { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import {
  View,
  TextInput,
  StyleSheet,
  Dimensions,
  Image,
  Platform,
  Text,
  TouchableOpacity,
} from 'react-native';
import lots from '../data/mockParking';
const { width, height } = Dimensions.get('window');

/**
 * Declare MapView and Marker placeholders, which will only be assigned
 * on native platforms (iOS/Android). For web, Leaflet is used instead.
 */
let MapView, Marker; // for native maps

/** 
 * Load React Native Maps only if NOT on web, since web uses Leaflet.
 */
if (Platform.OS !== 'web') {
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Marker = Maps.Marker;
}

/**
 * Helper function that extracts the most recent data point from a lot,
 * computes available/occupied counts, and returns the values.
 */
function getLatestAvailability(lot) {
  const latest = lot.dataPoints[lot.dataPoints.length - 1];
  const available = lot.total - latest.occupied;
  const occupied = latest.occupied;
  return {
    available,
    lastUpdated: latest.time,
    occupied
  };
}

/**
 * Main component: HomeScreen
 * Contains:
 *  - Search bar with suggestions
 *  - Web version using Leaflet
 *  - Native version using React Native Maps
 */
export default function HomeScreen() {
  /** State variables for search bar and Leaflet loading */
  const [search, setSearch] = useState('');
  const [LeafletReady, setLeafletReady] = useState(false);
  const [LeafletModules, setLeafletModules] = useState(null);

  const router = useRouter();

  /** Default region for the map (Lawrence, KS area) */
  const region = {
    latitude: 38.9543,
    longitude: -95.2558,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  };

  /**
   * Filters the parking lots based on what the user types.
   * Matches beginning of lot names (case-insensitive).
   */
  const filteredLots = lots.filter((lot) =>
    lot.name.toLowerCase().startsWith(search.trim().toLowerCase())
  );

  /**
   * Handles selection of a lot from the suggestions:
   * - Sets the search bar to the lot name
   * - Navigates to the Stats Page
   */
  const onSelectLot = (lot) => {
    setSearch(lot.name);
    router.push(`/StatsPage?lot=${encodeURIComponent(lot.name)}`);
  };

  /**
   * Renders suggestion dropdown below the search bar.
   * Shows matching lots and availability summary.
   */
  const renderSuggestions = () => {
    if (!search.trim()) return null; // nothing typed → no suggestions

    if (filteredLots.length === 0) {
      return (
        <View style={styles.suggestions}>
          <Text style={styles.noResults}>No lots found</Text>
        </View>
      );
    }

    return (
      <View style={styles.suggestions}>
        {filteredLots.slice(0, 6).map((lot) => {
          const { available } = getLatestAvailability(lot);
          return (
            <TouchableOpacity key={lot.id} style={styles.suggestionItem} onPress={() => onSelectLot(lot)}> 
              <Text style={styles.suggestionText}>{lot.name} — {available}/{lot.total}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  /**
   * Dynamically loads Leaflet only on web.
   * React Native Maps is used on native devices instead.
   */
  useEffect(() => {
    if (Platform.OS === 'web') {
      (async () => {
        const leaflet = await import('leaflet');
        const reactLeaflet = await import('react-leaflet');
        require('leaflet/dist/leaflet.css');
        setLeafletModules({ ...reactLeaflet, L: leaflet });
        setLeafletReady(true);
      })();
    }
  }, []);

  /**
   * WEB VERSION — Uses Leaflet map inside a MapContainer.
   * Shows lot markers as CircleMarkers with Popups.
   */
  if (Platform.OS === 'web') {
    if (!LeafletReady || !LeafletModules) {
      return (
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
          <Text>Loading map...</Text>
        </View>
      );
    }

    const { MapContainer, TileLayer, CircleMarker, Popup } = LeafletModules;

    return (
      <View style={styles.container}>
        <View style={{ flex: 1 }}>
          <MapContainer
            center={[region.latitude, region.longitude]}
            zoom={15}
            style={{ height: height, width: width }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {filteredLots.map((lot) => {
              const { occupied, available, lastUpdated } = getLatestAvailability(lot);
              return (
                <CircleMarker
                  key={lot.id}
                  center={[lot.latitude, lot.longitude]}
                  radius={10}
                  fillColor="#ff3333"
                  color="#fff"
                  weight={2}
                  opacity={1}
                  fillOpacity={0.9}
                >
                  <Popup>
  <div style={{ fontFamily: 'Arial, sans-serif', textAlign: 'center' }}>
    <div
      onClick={() => router.push(`/StatsPage?lot=${encodeURIComponent(lot.name)}`)}
      style={{
        color: '#1E90FF',
        fontWeight: '600',
        cursor: 'pointer',
        fontSize: 16,
        marginBottom: 4,
      }}
    >
      {lot.name}
    </div>
    <div style={{ fontSize: 14, color: '#333' }}>
      {available}/{lot.total} spots available
    </div>
    <div style={{ fontSize: 12, color: '#777', marginTop: 2 }}>
      Last updated: {lastUpdated}
    </div>
  </div>
</Popup>

                </CircleMarker>
              );
            })}
          </MapContainer>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="🔍 Find Lot"
            value={search}
            onChangeText={setSearch}
          />
          {renderSuggestions()} 
        </View>
      </View>
    );
  }

  /**
   * NATIVE VERSION — Uses React Native Maps and Marker components.
   * Shows clickable markers that display availability info.
   */
  return (
    <View style={styles.container}>
      <MapView style={styles.map} initialRegion={region}>
        {filteredLots.map((lot) => {
          const { available, lastUpdated } = getLatestAvailability(lot);
          return (
            <Marker
              key={lot.id}
              coordinate={{
                latitude: lot.latitude,
                longitude: lot.longitude,
              }}
              title={lot.name}
              description={`${available}/${lot.total} spots available (updated ${lastUpdated})`}
              anchor={{ x: 0.5, y: 1 }}
            >
              <Image
                source={require('../../assets/images/mark.png')}
                style={{ width: 40, height: 40 }}
                resizeMode="contain"
              />
            </Marker>
          );
        })}
      </MapView>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍 Find Lot"
          value={search}
          onChangeText={setSearch}
        />
        {renderSuggestions()}
      </View>
    </View>
  );
}

/** 
 * Styles for layout, search bar, suggestion list, and text.
 */
const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width, height },
  searchContainer: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: 'white',
    width: '90%',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  searchInput: {
    padding: 12,
    fontSize: 16,
    borderRadius: 20,
  },
  suggestions: {
    maxHeight: 220,
    marginTop: 8,
    borderTopWidth: 1,
    borderColor: '#eee',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  suggestionItem: {
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  suggestionText: {
    fontSize: 15,
    color: '#111',
  },
  noResults: {
    padding: 8,
    color: '#666',
  },
});
