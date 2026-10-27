import { toast } from "@/lib/toast";

/** Native share sheet where available, otherwise copy the link — with a toast either way. */
export async function shareLink(path: string, title: string, text: string) {
  const url = new URL(path, location.origin).toString();
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return;
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast({ message: "Link copied", tone: "accent" });
  } catch {
    toast({ message: url });
  }
}
