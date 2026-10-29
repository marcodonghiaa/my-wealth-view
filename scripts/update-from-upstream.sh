#!/usr/bin/env bash
# Bring the current branch's tracked files to the state of an upstream ref.
# Used by .github/workflows/update-from-upstream.yml, run from the user's repo.
#
#   update-from-upstream.sh <upstream-ref> <pr-body-file>
#
# Shared history with upstream -> merge (upstream wins conflicts).
# No shared history (Vercel clone button) -> overwrite files present upstream.
# Never touched: .env*, Vercel config, files the repo's .gitignore matches,
# .github/workflows/ (GITHUB_TOKEN cannot push workflow changes).
# Exit 0 = commit created, 10 = already up to date, anything else = failure.
set -euo pipefail

UP=${1:?upstream ref}
BODY=${2:?pr body file}
SHA=$(git rev-parse --short "$UP")

# Paths the sync must leave alone (grep -E, matched against the full path).
PROTECTED='^(\.env($|\.)|\.vercel/|vercel\.json$|\.github/workflows/)'

git config user.name >/dev/null || git config user.name "github-actions[bot]"
git config user.email >/dev/null || git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

if git merge-base HEAD "$UP" >/dev/null 2>&1; then
  mode=merge
  if git merge-base --is-ancestor "$UP" HEAD; then exit 10; fi
  {
    echo "Upstream commits merged in:"
    echo
    git log --no-merges --format='- `%h` %s' "HEAD..$UP"
  } >"$BODY"
  git merge -X theirs --no-edit "$UP" || { git merge --abort; echo "merge conflict that cannot be auto-resolved" >&2; exit 1; }
  # Merge may have touched protected paths; put them back as they were.
  git diff --name-only HEAD^1 HEAD | grep -E "$PROTECTED" | while read -r f; do
    if git cat-file -e "HEAD^1:$f" 2>/dev/null; then git checkout HEAD^1 -- "$f"; else git rm -qf -- "$f"; fi
  done || true
  git diff --cached --quiet || git commit -q --amend --no-edit
else
  mode=overwrite
  # Judge ignores by the user's .gitignore, before upstream's overwrites it.
  list=$(mktemp); ignored=$(mktemp)
  git ls-tree -r --name-only "$UP" | grep -Ev "$PROTECTED" >"$list"
  git check-ignore --no-index --stdin <"$list" >"$ignored" || true
  grep -Fxv -f "$ignored" "$list" | while IFS= read -r f; do git checkout "$UP" -- "$f"; done
  rm -f "$list" "$ignored"
  if git diff --cached --quiet; then exit 10; fi
  git commit -q -m "chore: sync with upstream $SHA"
  {
    echo "Your repo does not share git history with upstream (normal for the Vercel clone button), so files were synced by overwrite."
    echo "Files that exist only in your copy were kept. Latest upstream commits:"
    echo
    git log -20 --no-merges --format='- `%h` %s' "$UP"
    extra=$(comm -23 <(git ls-files | grep -Ev "$PROTECTED" | sort) <(git ls-tree -r --name-only "$UP" | sort) | head -20)
    if [ -n "$extra" ]; then
      printf '\nFiles only in your copy (kept, delete by hand if obsolete):\n\n'
      printf '%s\n' "$extra" | sed 's/^/- `/; s/$/`/'
    fi
  } >"$BODY"
fi
echo "mode=$mode sha=$SHA"
