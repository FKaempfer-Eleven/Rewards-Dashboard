// Approximate longitude/latitude centroids for US states + Canadian provinces.
// `spread` controls how widely salon pins are scattered around the centroid.

export type StateGeo = {
  name: string
  abbr: string
  lon: number
  lat: number
  spread: number
}

export const STATE_GEO: StateGeo[] = [
  // ---- United States ----
  { name: "Alabama", abbr: "AL", lon: -86.79, lat: 32.81, spread: 1.6 },
  { name: "Arizona", abbr: "AZ", lon: -111.66, lat: 34.05, spread: 2.4 },
  { name: "Arkansas", abbr: "AR", lon: -92.44, lat: 34.97, spread: 1.6 },
  { name: "California", abbr: "CA", lon: -119.68, lat: 36.12, spread: 3.0 },
  { name: "Colorado", abbr: "CO", lon: -105.31, lat: 39.06, spread: 2.4 },
  { name: "Connecticut", abbr: "CT", lon: -72.76, lat: 41.6, spread: 0.7 },
  { name: "Delaware", abbr: "DE", lon: -75.51, lat: 39.32, spread: 0.4 },
  { name: "Florida", abbr: "FL", lon: -81.69, lat: 28.0, spread: 2.4 },
  { name: "Georgia", abbr: "GA", lon: -83.64, lat: 32.68, spread: 1.8 },
  { name: "Idaho", abbr: "ID", lon: -114.48, lat: 44.24, spread: 2.4 },
  { name: "Illinois", abbr: "IL", lon: -88.99, lat: 40.35, spread: 2.0 },
  { name: "Indiana", abbr: "IN", lon: -86.26, lat: 39.85, spread: 1.4 },
  { name: "Iowa", abbr: "IA", lon: -93.21, lat: 42.01, spread: 1.8 },
  { name: "Kansas", abbr: "KS", lon: -98.0, lat: 38.53, spread: 2.4 },
  { name: "Kentucky", abbr: "KY", lon: -84.67, lat: 37.67, spread: 2.0 },
  { name: "Louisiana", abbr: "LA", lon: -91.87, lat: 31.17, spread: 1.6 },
  { name: "Maine", abbr: "ME", lon: -69.38, lat: 44.69, spread: 1.4 },
  { name: "Maryland", abbr: "MD", lon: -76.8, lat: 39.06, spread: 1.0 },
  { name: "Massachusetts", abbr: "MA", lon: -71.53, lat: 42.23, spread: 0.9 },
  { name: "Michigan", abbr: "MI", lon: -84.54, lat: 43.33, spread: 2.0 },
  { name: "Minnesota", abbr: "MN", lon: -94.31, lat: 45.69, spread: 2.2 },
  { name: "Mississippi", abbr: "MS", lon: -89.67, lat: 32.74, spread: 1.6 },
  { name: "Missouri", abbr: "MO", lon: -92.46, lat: 38.46, spread: 2.0 },
  { name: "Montana", abbr: "MT", lon: -110.45, lat: 46.92, spread: 3.0 },
  { name: "Nebraska", abbr: "NE", lon: -99.81, lat: 41.13, spread: 2.4 },
  { name: "Nevada", abbr: "NV", lon: -116.91, lat: 38.5, spread: 2.6 },
  { name: "New Hampshire", abbr: "NH", lon: -71.56, lat: 43.45, spread: 0.8 },
  { name: "New Jersey", abbr: "NJ", lon: -74.52, lat: 40.3, spread: 0.7 },
  { name: "New Mexico", abbr: "NM", lon: -106.24, lat: 34.41, spread: 2.4 },
  { name: "New York", abbr: "NY", lon: -75.5, lat: 42.95, spread: 2.0 },
  { name: "North Carolina", abbr: "NC", lon: -79.36, lat: 35.63, spread: 2.2 },
  { name: "North Dakota", abbr: "ND", lon: -100.47, lat: 47.45, spread: 2.2 },
  { name: "Ohio", abbr: "OH", lon: -82.79, lat: 40.29, spread: 1.6 },
  { name: "Oklahoma", abbr: "OK", lon: -97.49, lat: 35.57, spread: 2.2 },
  { name: "Oregon", abbr: "OR", lon: -120.55, lat: 44.0, spread: 2.4 },
  { name: "Pennsylvania", abbr: "PA", lon: -77.6, lat: 40.85, spread: 1.8 },
  { name: "Rhode Island", abbr: "RI", lon: -71.51, lat: 41.68, spread: 0.3 },
  { name: "South Carolina", abbr: "SC", lon: -80.95, lat: 33.86, spread: 1.4 },
  { name: "South Dakota", abbr: "SD", lon: -100.23, lat: 44.3, spread: 2.2 },
  { name: "Tennessee", abbr: "TN", lon: -86.66, lat: 35.85, spread: 2.4 },
  { name: "Texas", abbr: "TX", lon: -99.0, lat: 31.4, spread: 3.4 },
  { name: "Utah", abbr: "UT", lon: -111.66, lat: 39.32, spread: 2.0 },
  { name: "Vermont", abbr: "VT", lon: -72.71, lat: 44.07, spread: 0.8 },
  { name: "Virginia", abbr: "VA", lon: -78.66, lat: 37.52, spread: 2.0 },
  { name: "Washington", abbr: "WA", lon: -120.74, lat: 47.4, spread: 2.0 },
  { name: "West Virginia", abbr: "WV", lon: -80.61, lat: 38.64, spread: 1.4 },
  { name: "Wisconsin", abbr: "WI", lon: -89.99, lat: 44.62, spread: 1.8 },
  { name: "Wyoming", abbr: "WY", lon: -107.55, lat: 42.99, spread: 2.4 },
  { name: "Alaska", abbr: "AK", lon: -152.4, lat: 63.59, spread: 4.0 },
  { name: "Hawaii", abbr: "HI", lon: -157.5, lat: 20.8, spread: 1.2 },
  // ---- Canada ----
  { name: "Alberta", abbr: "AB", lon: -114.0, lat: 53.0, spread: 2.6 },
  { name: "British Columbia", abbr: "BC", lon: -123.2, lat: 51.0, spread: 3.0 },
  { name: "Manitoba", abbr: "MB", lon: -97.5, lat: 51.0, spread: 2.4 },
  { name: "New Brunswick", abbr: "NB", lon: -66.0, lat: 46.5, spread: 1.0 },
  { name: "Newfoundland", abbr: "NL", lon: -56.5, lat: 48.5, spread: 1.4 },
  { name: "Nova Scotia", abbr: "NS", lon: -63.0, lat: 45.0, spread: 1.0 },
  { name: "Ontario", abbr: "ON", lon: -80.0, lat: 44.5, spread: 2.6 },
  { name: "Prince Edward Island", abbr: "PE", lon: -63.2, lat: 46.4, spread: 0.4 },
  { name: "Quebec", abbr: "QC", lon: -71.5, lat: 46.5, spread: 2.6 },
  { name: "Saskatchewan", abbr: "SK", lon: -106.0, lat: 52.0, spread: 2.4 },
]

// TopoJSON sources rendered by react-simple-maps.
export const US_TOPO = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"
export const CANADA_TOPO =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json"
