import { defineConfig, devices } from "@playwright/test";

// Smoke test of the core swipe flow. Runs against a local production preview by default;
// set PLAYWRIGHT_BASE_URL to point it at a deployed URL instead. E2E_EMULATORS=1 builds against the local
// Auth/Firestore emulators (npm run test:e2e:emulators), so test runs don't spend the Spark plan's daily quota.
const emulators = process.env.E2E_EMULATORS === "1";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? (emulators ? "http://localhost:4175" : "http://localhost:4173");

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : emulators
      ? {
          command: "cross-env VITE_FIREBASE_EMULATORS=1 vite build --outDir .cache/dist-emu --emptyOutDir && vite preview --outDir .cache/dist-emu --port 4175 --strictPort",
          url: "http://localhost:4175/",
          reuseExistingServer: false,
          timeout: 240_000,
        }
      : {
        command: "npm run build && npx vite preview --port 4173 --strictPort",
        url: "http://localhost:4173/",
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
      },
});
