# Contributing

This is a solo-maintained project — PRs and issues are welcome, response time varies.

## Before opening a PR

1. `bun run lint` and `bun run build` should both pass.
2. Test against the `/demo` route and against a real Supabase project if your change touches data fetching.
3. Keep PRs scoped to one change — easier to review, easier to revert if something breaks.

## Reporting bugs / security issues

- Regular bugs: open a GitHub issue with the bug report template.
- Anything touching auth, RLS, or secrets: email the maintainer directly instead of opening a public issue.
