import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "404",
  description:
    "Not found",
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
            fontSize: "45px",
            fontWeight: 400,
            lineHeight: 1.25,
            marginTop: 0,
          }}
        >
          404 Not Found
        </h1>
    </main>
  );
}
