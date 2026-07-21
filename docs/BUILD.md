# Build & bundling

Sprint 1.4 introduced route-level code splitting and vendor chunking so the landing page ships a small, cache-friendly bundle.

## Route-level lazy loading

`src/App.tsx` loads only the landing page (`Index`) eagerly. Every other route is `React.lazy()` behind a `<Suspense fallback>`. Add new pages the same way:

```tsx
const NewPage = lazy(() => import("./pages/NewPage"));
```

Never eager-import an admin, organizer, or map-heavy page — it defeats the split.

## Manual vendor chunks

`vite.config.ts > build.rollupOptions.output.manualChunks` groups heavy dependencies so they cache independently and don't invalidate on every app change:

- `react-vendor` – React + Router
- `radix-ui` – shadcn's Radix primitives
- `supabase` – `@supabase/supabase-js`
- `query` – TanStack Query
- `leaflet` – map runtime (only pulled in by map routes anyway)
- `motion` – framer-motion
- `forms` – react-hook-form + zod resolvers

When you add a large dependency (>50 KB gzipped), consider giving it its own chunk. Verify with `npm run build` and inspect the Vite output for chunk sizes.

## Chunk size warnings

`chunkSizeWarningLimit` is set to 900 KB. If a chunk crosses that ceiling, prefer:

1. Splitting the offending route with `React.lazy`.
2. Moving the dependency into a dedicated `manualChunks` entry.
3. Loading the module dynamically (`await import(...)`) inside the handler that needs it.

Do not raise the limit to silence a warning.
