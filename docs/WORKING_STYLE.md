# Working Style — Building Routes

How a batch of routes for one module gets built, e.g. "5 APIs for this module."
Follow this loop; don't build the whole batch in one pass.

1. **Checklist table first.** Before writing any route in the batch, add all of
   them to `docs/checklist.md` as a table: why the route is needed, which
   screen it powers, what it returns. This is the plan Nahid reviews before
   code starts.
2. **Figma-driven response shape, not a kitchen sink.** Each route returns only
   the fields that have a concrete reason to be there — usually whatever
   Figma shows for that screen. Don't return the whole model "just in case."
   When Figma isn't available for a task, Nahid provides a brief instead —
   that becomes the source of truth for the response shape.
3. **One route, then stop.** Build a single route, run lint and the relevant
   tests (or `npm run verify`), then stop. Don't continue to the next route
   in the batch.
4. **Wait for sign-off.** Nahid pushes, opens the PR, and merges that one
   route himself, then messages back once it's done. Only then does the next
   route in the batch start.

Comments: minimal, one line only where something genuinely needs explaining —
heavy commenting makes commit diffs look messy.

Code: careful and deliberate, not rushed — the goal is to avoid landing in
bugs that need a later fix pass, not just to move fast. evry time you should to . test it like this first eslint test then jest test then build deploy and strict rule is you not gonna push it with gh your self instead of send me command i will push it
