export function readStorage(key: string): string | null {
  try { return typeof window === "undefined" ? null : localStorage.getItem(key); }
  catch { return null; }
}
