import type { RequestStatus } from "@shared/domain";

export const STATUS_BADGE: Record<RequestStatus, { label: string; tone: "positive" | "accent" | "neutral" | "ink" }> = {
  active: { label: "Live", tone: "positive" },
  paused: { label: "Paused", tone: "neutral" },
  closed: { label: "Closed", tone: "neutral" },
  funded: { label: "Fully funded", tone: "accent" },
};
