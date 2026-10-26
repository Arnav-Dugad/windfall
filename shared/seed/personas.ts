import type { SeedSeeker } from "../domain";

// All personas are fictional and exist only for the demo.

export interface DemoPatron {
  id: string;
  persona: string;
  displayName: string;
  blurb: string;
  anonymousByDefault: boolean;
  /** Roughly how many past gifts to generate, and their typical size. */
  history: { gifts: number; typicalCents: number };
}

/** Three loginable Patrons with existing giving history. */
export const DEMO_PATRONS: DemoPatron[] = [
  {
    id: "usr_demo_eleanor",
    persona: "eleanor",
    displayName: "Eleanor V.",
    blurb: "Shipping heiress. Gives big, gives often, prefers medical debt.",
    anonymousByDefault: false,
    history: { gifts: 26, typicalCents: 2_500_000 },
  },
  {
    id: "usr_demo_theo",
    persona: "theo",
    displayName: "Theo M.",
    blurb: "Sold a fintech startup. Methodical — loves clearing a debt to zero.",
    anonymousByDefault: false,
    history: { gifts: 14, typicalCents: 4_000_000 },
  },
  {
    id: "usr_demo_sora",
    persona: "sora",
    displayName: "Sora K.",
    blurb: "Quiet philanthropist. Always gives anonymously.",
    anonymousByDefault: true,
    history: { gifts: 19, typicalCents: 800_000 },
  },
];

/** Non-loginable Patrons that make the leaderboard and funding totals feel lived-in. */
export const COMMUNITY_PATRONS: { id: string; displayName: string; anonymousByDefault: boolean }[] = [
  { id: "usr_seed_ines", displayName: "Inès R.", anonymousByDefault: false },
  { id: "usr_seed_marcus", displayName: "Marcus O.", anonymousByDefault: false },
  { id: "usr_seed_priya", displayName: "Priya S.", anonymousByDefault: false },
  { id: "usr_seed_henrik", displayName: "Henrik L.", anonymousByDefault: true },
  { id: "usr_seed_adaeze", displayName: "Adaeze N.", anonymousByDefault: false },
  { id: "usr_seed_julian", displayName: "Julian F.", anonymousByDefault: false },
  { id: "usr_seed_mei", displayName: "Mei W.", anonymousByDefault: true },
  { id: "usr_seed_rafael", displayName: "Rafael D.", anonymousByDefault: false },
  { id: "usr_seed_cordelia", displayName: "Cordelia B.", anonymousByDefault: false },
  { id: "usr_seed_kenji", displayName: "Kenji T.", anonymousByDefault: true },
];

export const DEMO_SEEKER_ID = "usr_demo_maya";
export const DEMO_SEEKER_REQUEST_ID = "req_demo_maya";

/** The loginable demo Seeker and her live request. */
export const DEMO_SEEKER: SeedSeeker & { userId: string; requestId: string } = {
  userId: DEMO_SEEKER_ID,
  requestId: DEMO_SEEKER_REQUEST_ID,
  slug: "maya-portland",
  firstName: "Maya",
  age: 34,
  city: "Portland",
  country: "United States",
  countryCode: "US",
  lat: 45.52,
  lng: -122.68,
  category: "medical",
  headline: "A ceramics teacher, a cycling accident, and two very expensive wrists",
  story:
    "I teach ceramics to kids at a community arts center, which is the best job in the world and pays like it. Last spring a delivery van turned across the bike lane on my way to work. I'm fine now, mostly, but both of my wrists needed surgery, and a potter without wrists is just a person who owns a kiln.\n\nThe driver's insurer has been disputing liability for nine months. In the meantime, the hospital, the surgeon and the hand therapist all want to be paid, and at my income the payment plans would take eleven years.\n\nClearing it would let me stop picking up weekend shifts and go back to teaching the Saturday wheel class I had to drop, the one the kids actually show up early for.",
  breakdown: [
    { label: "Wrist surgery (two procedures)", amountCents: 2_140_000 },
    { label: "Hand therapy, 30 sessions", amountCents: 486_000 },
    { label: "ER visit & imaging", amountCents: 312_000 },
  ],
  verified: true,
  fundedRatio: 0.42,
  postedDaysAgo: 21,
  updates: [
    {
      daysAgo: 9,
      kind: "update",
      body: "Cleared to throw again! Only small pots for now, but the wheel and I are back on speaking terms.",
    },
    {
      daysAgo: 3,
      kind: "thanks",
      body: "My students made thank-you mugs for the Patrons. They are lopsided and perfect. Thank you, truly.",
    },
  ],
};
