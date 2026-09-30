"use client";

// Replaces the root layout when it fails, so it brings its own document and minimal inline styles.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0 }}>
        <title>Something went wrong · Notetaker</title>
        <div role="alert" style={{ textAlign: "center", maxWidth: 360, padding: 24 }}>
          <h1 style={{ fontSize: 18 }}>Something went wrong</h1>
          <p style={{ color: "#666", fontSize: 14 }}>The app couldn&apos;t load. Please try again in a moment.</p>
          {error.digest && <p style={{ color: "#888", fontSize: 12, fontFamily: "monospace" }}>Ref {error.digest}</p>}
          <button onClick={() => retry()} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 8, border: "1px solid #ccc", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
