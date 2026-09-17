# Testing

100% test coverage is the key to great vibe coding. Tests let you move fast, trust your
instincts, and ship with confidence — without them, vibe coding is just yolo coding.
With tests, it's a superpower.

## Framework

[vitest](https://vitest.dev) + [@testing-library/react](https://testing-library.com/react) (jsdom environment).

## Run

```bash
bun run test
```

## Layers

- **Unit tests** — pure functions (`src/lib/`, route-local helpers like `safeNext` in
  `src/routes/auth.tsx`). Colocated as `*.test.ts` next to the file under test.
- **Component tests** — not yet started; add with `@testing-library/react`'s `render`/`screen`
  when a component's behavior (not just its markup) is worth locking down.
- **E2E** — not set up. This app is Supabase-backed and RLS-gated; an E2E suite needs a seeded
  test project, which is out of scope for this bootstrap.

## Conventions

- File naming: `<source-file>.test.ts` colocated next to the source, not in a separate `test/` tree.
- Assertion style: `expect(...).toBe(...)` / `.toBeUndefined()` — vitest's built-in `expect`,
  extended with `@testing-library/jest-dom` matchers (`toBeInTheDocument`, etc.) once component
  tests start.
- No mocking framework configured yet — add `vi.mock` usage as needed when the first test
  requires it.
