# Release operations

Treat publication as a separate gate from local generation and automated verification.

1. Record an ordinary commit for each change. Do not move or replace a published release tag.
2. Run the relevant tests and `npm run verify` before a release. Preserve the result and unresolved limits.
3. For a fix to a published release, create a new patch version and a new tag pointing to its commit.
4. Publish the package and release assets from that immutable tag. Check that each public URL serves the intended version.
5. Exercise the user-facing path after deployment: open documents, click and seek through video with sound, and follow README links from the public page. Record the URL, time, action, and observed result.
6. If the public behavior fails, mark deployment incomplete and restore the last verified version or publish a corrected patch version. Do not report completion from an HTTP status or CI badge alone.

Record `created`, `automated_checks_passed`, and `end_user_verified` as separate evidence. A missing end-user check stays `pending` with a reason. Do not infer that an external researcher accepted the result from a synthetic test.
