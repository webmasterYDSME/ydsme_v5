import Link from "next/link";

export function PortalPagination({
  currentPage,
  totalPages,
  totalItems,
  itemLabel,
  href,
  ariaLabel,
}: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemLabel: string;
  href: (page: number) => string;
  ariaLabel: string;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav className="pagination" aria-label={ariaLabel}>
      {currentPage > 1 ? <Link href={href(currentPage - 1)} prefetch={false}>← Previous</Link> : <span />}
      <span>Page {currentPage} of {totalPages} · {totalItems} {itemLabel}</span>
      {currentPage < totalPages ? <Link href={href(currentPage + 1)} prefetch={false}>Next →</Link> : <span />}
    </nav>
  );
}
