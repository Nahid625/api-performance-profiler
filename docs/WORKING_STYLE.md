# Working Style

How work gets delivered on this project.

## Communication

- Short answers. Lead with the conclusion, not the reasoning.
- No long multi-section essays unless a report, checklist or detailed
  breakdown was asked for.
- If something is broken or uncertain, say so plainly **first** — never bury
  bad news under context.
- Explain each unit in Bangla before writing any of its code, then wait for
  a go-ahead.

## Git — hard rules

- **Never run `git add`, `git commit`, `git merge` or `git push`.** Write the
  code, verify it, then hand over the exact commands to run. Keep them simple
  one-liners — no heredocs or shell scripting.
- **Never run destructive git commands** (`reset --hard`, `checkout .`,
  force-push, `branch -D`) without being asked for that exact action in that
  moment.
- Before any command that could discard uncommitted work, check `git status`.
  If something unfamiliar is in the working tree, ask before touching it.
- Git rarely deletes anything immediately. A "lost" commit is usually still
  reachable by hash (`git cat-file -t <hash>`) even after a bad `reset --hard`.
  Diagnose before treating work as gone.

## Branches

One branch per unit, named `phase-<n>-unit-<n>`:

```
phase-1-unit-1
phase-2-unit-1
```

Branch from `main`, build the one unit, stop. Nahid reviews, pushes and merges
himself. Once merged, that branch is deleted on GitHub and locally — only
`main` and the current unit's branch should exist.

## The build loop

1. **Plan first.** Every item in the batch goes into `docs/checklist.md` as a
   table: why it's needed, which screen or caller it powers, what it returns.
   Nahid reviews this before code starts.
2. **Build one, then stop.** One unit at a time, never the whole batch. Run
   verification, then stop.
3. **Wait for sign-off.** Nahid pushes and merges that one piece, then comes
   back. Only then does the next unit start.

## Code quality

- Minimal comments — **one line**, two at the absolute most, and only where the
  *why* is genuinely not visible from the code. Never a "what". Heavy
  commenting makes diffs noisy and reads as AI-generated.
- Careful and deliberate over fast. The goal is not landing in a state that
  needs a bug-fix pass later.
- No premature abstraction, no speculative flexibility for hypothetical future
  needs. Solve the task in front of you.
- Return only the fields that have a concrete reason to exist — driven by what
  the actual UI or caller needs, not "the whole model, just in case."

## Verification, before calling anything done

```bash
npm run verify    # eslint → jest → build
```

CI runs the same three on every push and pull request. The full intended order
is format → typecheck → the relevant unit tests → the full suite → lint → any
project-specific consistency check; `verify` covers what exists today and grows
as steps are added.

- If it is user-facing and testable live, actually run it against realistic
  data rather than trusting the test suite alone.
- Any test-data mutation against shared state gets restored afterwards. Never
  touch a server or port that was not spun up for this verification.

## Trust but verify

- Do not take a generated summary, review or "this matches" claim at face
  value — including earlier output in the same session. Check it against the
  real, current state before reporting it as fact.
- A memory, note or doc is a point-in-time snapshot, not live truth. Re-verify
  against the current code before relying on it, especially after a context
  reset.
