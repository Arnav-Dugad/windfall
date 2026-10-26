/**
 * Screen-reader announcements via a single polite live region (rendered by <LiveAnnouncer/>).
 * Use for things that happen without focus moving: gifts confirmed, cards passed, undo.
 */
type Listener = (msg: string) => void;
const listeners = new Set<Listener>();

export function announce(message: string) {
  listeners.forEach((l) => l(message));
}

export function subscribeAnnouncements(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
