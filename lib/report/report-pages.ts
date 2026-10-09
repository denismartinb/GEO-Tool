import type { ReportModel } from "@/lib/report/report-model";

/**
 * GEO-REPORT-1 Fase 2 — splits the question × engine map across as many A4
 * pages as it needs. Pure, no DOM.
 *
 * The printed page has a fixed height and hides what overflows it, so a map
 * longer than one page would lose its last questions without any sign. The
 * height of each row is estimated from its text (the question column wraps at
 * roughly `CHARS_PER_LINE`), which errs on the tall side: a page that ends up
 * a little short is fine, a question that disappears is not.
 */

const CHARS_PER_LINE = 64;
const ROW_BASE_PX = 12;
const LINE_PX = 15;
const GROUP_ROW_PX = 30;
/** Room for rows on the first map page (below the title and the intro) and on the ones after it. */
export const FIRST_PAGE_ROWS_PX = 700;
export const NEXT_PAGE_ROWS_PX = 820;

export type MatrixGroup = ReportModel["matrix"]["groups"][number];
export type MatrixPage = Array<{ topic: string; continued: boolean; rows: MatrixGroup["rows"] }>;

export function estimateRowPx(text: string): number {
  return ROW_BASE_PX + LINE_PX * Math.max(1, Math.ceil(text.length / CHARS_PER_LINE));
}

export function paginateMatrix(
  groups: MatrixGroup[],
  firstPx = FIRST_PAGE_ROWS_PX,
  nextPx = NEXT_PAGE_ROWS_PX
): MatrixPage[] {
  const pages: MatrixPage[] = [];
  let page: MatrixPage = [];
  let room = firstPx;
  const newPage = () => {
    pages.push(page);
    page = [];
    room = nextPx;
  };
  for (const group of groups) {
    let open: MatrixPage[number] | null = null;
    for (const row of group.rows) {
      const rowPx = estimateRowPx(row.promptText);
      const headerPx = open ? 0 : GROUP_ROW_PX;
      if (page.length > 0 && rowPx + headerPx > room) {
        newPage();
        open = null;
      }
      if (!open) {
        open = { topic: group.topic, continued: group.rows[0] !== row, rows: [] };
        page.push(open);
        room -= GROUP_ROW_PX;
      }
      open.rows.push(row);
      room -= rowPx;
    }
  }
  if (page.length > 0) pages.push(page);
  return pages;
}
