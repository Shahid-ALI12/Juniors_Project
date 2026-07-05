"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html>
      <body>
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#f8fafc",
            padding: "16px",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div style={{ maxWidth: "400px", textAlign: "center", spaceY: "16px" }}>
            <div style={{ fontSize: "64px", lineHeight: 1 }}>💥</div>
            <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#0f172a", margin: "16px 0 8px" }}>
              Critical Error
            </h1>
            <p style={{ fontSize: "14px", color: "#64748b", margin: 0 }}>
              {error.message || "A critical error occurred. Please refresh the page."}
            </p>
            <button
              onClick={() => reset()}
              style={{
                marginTop: "16px",
                padding: "8px 24px",
                backgroundColor: "#0f172a",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
