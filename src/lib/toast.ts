// Tiny toast store; rendered by <Toaster/>.

export interface Toast {
  id: number;
  message: string;
  tone?: "neutral" | "accent" | "positive" | "danger";
  action?: { label: string; onClick: () => void };
  duration?: number;
}

let toasts: Toast[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function subscribeToasts(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export const getToasts = () => toasts;

export function toast(t: Omit<Toast, "id">) {
  const id = ++seq;
  toasts = [...toasts.slice(-2), { ...t, id }];
  emit();
  setTimeout(() => dismissToast(id), t.duration ?? 4200);
  return id;
}
export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}
