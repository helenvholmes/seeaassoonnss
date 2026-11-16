# Notes for Claude

## Shipping fixes

The owner wants fixes live without being asked each time. Once a fix is tested
(`npm run lint`, `npm test`, `npm run test:e2e`, `npm run build`) and committed on the working branch,
merge it into `main` and push. Vercel deploys `main` to seeaassoonnss.app. Then say
what went live.

This covers fixes and small improvements. Ask first for anything risky or hard to
undo: database migrations that change or drop data, changes to sign-in or passkeys,
or large rewrites.

## Tests

- `npm test`: unit tests (test/*.test.ts) for pure logic.
- `npm run test:e2e`: browser tests (e2e/, Playwright) that drive the real editor and
  reader with mouse, keys and scrolling, on fixture seasons in src/app/e2e (served only
  when E2E=1). Stop any dev server first; the tests start their own on port 3100.

Anything that works through clicks, drags, keys or scrolling gets a browser test when it
is built or fixed, so it cannot ship broken again. Run the checks before committing, and
push only after they pass.
