# Notes for Claude

## Shipping fixes

The owner wants fixes live without being asked each time. Once a fix is tested
(`npm run lint`, `npm test`, `npm run build`) and committed on the working branch,
merge it into `main` and push. Vercel deploys `main` to seeaassoonnss.app. Then say
what went live.

This covers fixes and small improvements. Ask first for anything risky or hard to
undo: database migrations that change or drop data, changes to sign-in or passkeys,
or large rewrites.
