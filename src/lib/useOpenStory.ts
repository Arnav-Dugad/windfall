import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router";
import type { RequestCard } from "@shared/domain";

/** Opens a story as an overlay above the current page, so `art-${id}` portraits can morph into the hero. */
export function useOpenStory() {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback((card: RequestCard) => navigate(`/story/${card.id}`, { state: { background: location, card } }), [navigate, location]);
}
