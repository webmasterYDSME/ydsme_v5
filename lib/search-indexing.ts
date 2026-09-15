// Keep operational and token-bearing workflows out of search results.
export function shouldNoIndex(pathname: string, deploymentEnvironment?: string) {
  if (deploymentEnvironment === "preview") return true;
  const prefixes = ["/api", "/account", "/admin", "/administrator", "/auth", "/dashboard", "/settings", "/signin", "/reset-password", "/thank-you", "/under-review", "/membership/apply", "/membership/checkout", "/membership/status", "/membership/guardian-consent", "/membership/contact-change", "/membership/newsletter"];
  return prefixes.some(path => pathname === path || pathname.startsWith(`${path}/`)) || /^\/events\/[^/]+\/book(?:\/|$)/.test(pathname);
}
