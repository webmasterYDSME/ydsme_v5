export const HOLDING_PAGE_PATH = "/under-review";

/**
 * Optionally show the holding page on every hostname for this deployment.
 * Operational API endpoints remain reachable for webhooks and scheduled jobs.
 *
 * @param {string | undefined} underReview
 * @param {string} pathname
 */
export function shouldShowHoldingPage(underReview, pathname) {
  return (
    underReview?.trim().toLowerCase() === "true" &&
    pathname !== HOLDING_PAGE_PATH &&
    !pathname.startsWith("/api/")
  );
}
