import type { Role } from "@shared/domain";

/** Story is preloaded by the deck so the card → story expand never waits on the network. */
export const loadStory = () => import("@/routes/Story");

export function homeFor(role: Role) {
  return role === "patron" ? "/discover" : "/seeker";
}
