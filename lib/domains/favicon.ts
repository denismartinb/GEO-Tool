/**
 * Real favicon via an external favicon service — pure frontend <img> src, no
 * crawler and no new schema (Task Intake, 2026-07-23: founder-approved
 * "recuperando favicons"). Sends the domain to Google on every page load;
 * disclosed in that Task Intake report.
 *
 * Extracted from app/dashboard/projects/[projectId]/page.tsx (Overview) so
 * the sidebar's project switcher can show the same real brand icon instead
 * of a letter placeholder, without duplicating the URL-building logic.
 */
export function faviconUrl(domain: string | null | undefined): string | null {
  if (!domain) return null;
  const clean = domain.trim().toLowerCase().replace(/^www\./, "");
  if (!clean) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(clean)}&sz=64`;
}
