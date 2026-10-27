// Optional browser notifications for activity (milestones, thank-yous). Off unless the Patron opts in, and
// only fire while Give is open — there's no push server on the free plan.

const KEY = "give:notify";

export function notificationsEnabled() {
  try {
    return typeof Notification !== "undefined" && Notification.permission === "granted" && localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export async function setNotificationsEnabled(on: boolean) {
  try {
    if (!on) return localStorage.removeItem(KEY);
    const p = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (p === "granted") localStorage.setItem(KEY, "1");
  } catch {
    /* storage or permissions unavailable */
  }
}

const shown = new Set<string>();
/** Shows at most one notification per item id per page load, and only when the tab is hidden. */
export function notify(id: string, title: string, body: string, icon?: string | null) {
  if (!notificationsEnabled() || shown.has(id) || document.visibilityState === "visible") return;
  shown.add(id);
  try {
    new Notification(title, { body, icon: icon ?? "/icon-192.png", tag: id });
  } catch {
    /* some mobile browsers only allow notifications from a service worker */
  }
}
