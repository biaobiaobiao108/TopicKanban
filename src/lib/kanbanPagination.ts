/** Restore the last successfully loaded page when the current page request fails. */
export function rollbackFailedKanbanPage(currentPage: number, failedPage: number): number {
  if (currentPage !== failedPage) return currentPage;
  return Math.max(1, failedPage - 1);
}
