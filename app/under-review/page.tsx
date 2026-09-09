import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "404",
  description: "Website under review - not found.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function UnderReviewPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#fff",
        color: "#222",
        fontFamily: "Arial, Helvetica, sans-serif",
        display: "grid",
        placeItems: "center",
        padding: "48px 16px",
      }}
    >
      <h1
        style={{
          margin: 0,
          fontSize: "45px",
          fontWeight: 400,
          lineHeight: 1.25,
        }}
      >
        404 Not Found
      </h1>
    </main>
  );
}
