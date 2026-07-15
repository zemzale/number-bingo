"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useMemo, type ReactNode } from "react";

export default function ConvexClientProvider({ children }: { children: ReactNode }) {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  const client = useMemo(() => (url ? new ConvexReactClient(url) : null), [url]);

  if (!client) {
    return (
      <main className="setupShell">
        <section className="setupCard">
          <p className="eyebrow">One-time setup</p>
          <h1>Connect Convex</h1>
          <p>
            Run <code>npx convex dev</code> in this project, then restart the
            Next.js development server. Convex will add the required URL to
            <code> .env.local</code>.
          </p>
        </section>
      </main>
    );
  }

  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
