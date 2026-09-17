## Testing

Run: `bun run test` (vitest). See [TESTING.md](TESTING.md) for framework, layers, and conventions.

- 100% test coverage is the goal — tests make vibe coding safe.
- When writing a new function, write a corresponding test.
- When fixing a bug, write a regression test.
- When adding error handling, write a test that triggers the error.
- When adding a conditional (if/else, switch), write tests for both paths.
- Never commit code that makes existing tests fail.
