/** Shared date/time formatting helpers */

/** e.g. "9 Mar 2026" */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** e.g. "Mon" */
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-SG', { weekday: 'short' });
}
