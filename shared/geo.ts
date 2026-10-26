// Country list for the Seeker request form and approximate centroids for the impact map.

export const COUNTRIES: { code: string; name: string; lat: number; lng: number }[] = [
  { code: "AR", name: "Argentina", lat: -34.6, lng: -58.4 },
  { code: "AU", name: "Australia", lat: -33.9, lng: 151.2 },
  { code: "BD", name: "Bangladesh", lat: 23.8, lng: 90.4 },
  { code: "BR", name: "Brazil", lat: -23.5, lng: -46.6 },
  { code: "CA", name: "Canada", lat: 43.7, lng: -79.4 },
  { code: "CL", name: "Chile", lat: -33.4, lng: -70.7 },
  { code: "CO", name: "Colombia", lat: 4.7, lng: -74.1 },
  { code: "DE", name: "Germany", lat: 52.5, lng: 13.4 },
  { code: "EG", name: "Egypt", lat: 30.0, lng: 31.2 },
  { code: "ES", name: "Spain", lat: 40.4, lng: -3.7 },
  { code: "ET", name: "Ethiopia", lat: 9.0, lng: 38.7 },
  { code: "FR", name: "France", lat: 48.9, lng: 2.4 },
  { code: "GB", name: "United Kingdom", lat: 51.5, lng: -0.1 },
  { code: "GH", name: "Ghana", lat: 5.6, lng: -0.2 },
  { code: "GR", name: "Greece", lat: 37.98, lng: 23.7 },
  { code: "ID", name: "Indonesia", lat: -6.2, lng: 106.8 },
  { code: "IE", name: "Ireland", lat: 53.3, lng: -6.3 },
  { code: "IN", name: "India", lat: 19.1, lng: 72.9 },
  { code: "IT", name: "Italy", lat: 41.9, lng: 12.5 },
  { code: "JM", name: "Jamaica", lat: 18.0, lng: -76.8 },
  { code: "JP", name: "Japan", lat: 35.7, lng: 139.7 },
  { code: "KE", name: "Kenya", lat: -1.3, lng: 36.8 },
  { code: "KR", name: "South Korea", lat: 37.6, lng: 127.0 },
  { code: "MA", name: "Morocco", lat: 33.6, lng: -7.6 },
  { code: "MX", name: "Mexico", lat: 19.4, lng: -99.1 },
  { code: "NG", name: "Nigeria", lat: 6.5, lng: 3.4 },
  { code: "NL", name: "Netherlands", lat: 52.4, lng: 4.9 },
  { code: "NZ", name: "New Zealand", lat: -36.8, lng: 174.8 },
  { code: "PE", name: "Peru", lat: -12.0, lng: -77.0 },
  { code: "PH", name: "Philippines", lat: 14.6, lng: 121.0 },
  { code: "PK", name: "Pakistan", lat: 24.9, lng: 67.0 },
  { code: "PL", name: "Poland", lat: 52.2, lng: 21.0 },
  { code: "PT", name: "Portugal", lat: 38.7, lng: -9.1 },
  { code: "SE", name: "Sweden", lat: 59.3, lng: 18.1 },
  { code: "TH", name: "Thailand", lat: 13.8, lng: 100.5 },
  { code: "TR", name: "Türkiye", lat: 41.0, lng: 29.0 },
  { code: "UA", name: "Ukraine", lat: 50.5, lng: 30.5 },
  { code: "US", name: "United States", lat: 39.8, lng: -98.6 },
  { code: "VN", name: "Vietnam", lat: 10.8, lng: 106.7 },
  { code: "ZA", name: "South Africa", lat: -26.2, lng: 28.0 },
];

export function countryCentroid(code: string) {
  return COUNTRIES.find((c) => c.code === code.toUpperCase()) ?? null;
}

/** 🇺🇸-style flag emoji from an ISO alpha-2 code. */
export function flagEmoji(code: string): string {
  return code
    .toUpperCase()
    .replace(/[A-Z]/g, (ch) => String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65));
}
