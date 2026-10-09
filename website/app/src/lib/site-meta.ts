// Set at build time after the new Worker URL/domain is known.
// Unconfigured metadata must never send visitors to the old host.
export function canonicalLinks(path: string) {
  const origin = import.meta.env.VITE_PUBLIC_SITE_URL;
  return origin ? [{ rel: "canonical", href: new URL(path, origin).href }] : [];
}
