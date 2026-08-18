export const HOLDING_DEPLOYMENT_HOST = "ydsme-v5.vercel.app";
export const HOLDING_PAGE_PATH = "/under-review";

/**
 * Keep the Vercel production alias private from casual public browsing while
 * leaving Preview deployments available through Vercel's protected share link.
 * Operational API endpoints remain reachable for webhooks and scheduled jobs.
 *
 * @param {string} hostname
 * @param {string} pathname
 */
export function shouldShowHoldingPage(hostname, pathname) {
  return (
    hostname.toLowerCase() === HOLDING_DEPLOYMENT_HOST &&
    pathname !== HOLDING_PAGE_PATH &&
    !pathname.startsWith("/api/")
  );
}
