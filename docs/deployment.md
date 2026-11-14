# Public Vercel deployment

**https://prooflot.vercel.app** runs the application without the developer's computer.

The Vercel Node.js gateway forwards requests to one named, persistent Vercel Sandbox. A 1 GiB Vercel Drive stores SQLite. Only an authenticated gateway can reach application endpoints; direct Sandbox requests return 403. Secure HttpOnly cookies, exact-origin mutation checks and NEP-413 messages bind sessions to the public HTTPS origin. A failed POST is never automatically replayed.

Python runs inside a fresh Docker container in the dedicated VM. The deployed runtime was checked for UID 65534, 128 MiB memory, 0.5 CPU, 32 processes, read-only root, blocked network, no host data mount and no inherited server secrets. The VM's cgroup hierarchy is prepared so these resource limits actually apply. This remains an unaudited prototype, not an independently certified hostile-code service.

## Recorded verification

- [Public-service creator/buyer test](cloud-wallet-evidence.json): 14 checks, real Python execution, creator-signed publication, buyer-signed testnet payment, version-bound entitlement, fresh retest, cross-session recovery and creator withdrawal. Separate SDK test accounts signed; this is not a new Meteor UI approval test.
- [Actual downloaded package](cloud-download-evidence.json): 65,989 bytes saved and read back from disk; source/report/license binding and all six package files verified. Anonymous and logged-out downloads were denied.
- [Stop/resume verification](cloud-persistence-evidence.json): 12 bots, 47 reports, 20 listings and 10 licenses retained. Every report hash matched. The first public request resumed the stopped backend in about 4.5 seconds.
- [Download after restart](cloud-after-resume-download.json): identical ZIP SHA-256 `733413cf323a2e77054dec0b9d9941010f41cdaa1aacc1b1a84ee69fb00d9c06`.
- [Local release tests](cloud-test-results.txt): 91 passed, zero failures or skips, including real Docker isolation, gateway forwarding and public admission-limit tests.
- [Final security review](security-review.md): dependency patch, key exposure scan, public HTTP permission checks and successful package download after the security deployment.

An initial cloud Python attempt failed before execution while the Docker cgroup configuration was being corrected. Its failed report was retained. The successful 14-check run uses a new version and separate reports; failed results were not relabeled as successes.

## Hosting limits

This deployment uses Vercel Hobby. Sandbox sessions last up to 40 minutes in this configuration and resume on demand. A cold request can take several seconds. Database state persists on the separate Drive; running processes do not persist. Interrupted jobs are retained as interrupted and require an explicit new run. The app allows at most two concurrent bot executions. Included compute, storage and network quotas apply; exceeding a Hobby quota may pause availability. This is a submitted prototype, not an unlimited production SLA.

References: [Vercel persistence](https://vercel.com/docs/sandbox/concepts/persistent-sandboxes), [Drives](https://vercel.com/docs/sandbox/concepts/drives), [Hobby quotas](https://vercel.com/docs/sandbox/pricing).

## Operator deployment

The gateway lives in `deploy/vercel`; it is a distinct deployment directory with its own lockfile. Link it to a Vercel project and use `vercel env pull` there to obtain local short-lived OIDC credentials. Set the assigned HTTPS origin with `node scripts/cloud-provision.mjs https://your-production-origin` after reviewing the script and configuring your own development testnet operator. The prepared helper uses Windows DPAPI and the existing testnet fixture data. It copies only application source and a consistent database snapshot with local sessions, wallet sessions and wallet challenges removed. It never copies a personal wallet key.

`scripts/cloud-configure.mjs` sends the gateway secret through CLI stdin as a Vercel Secret. Its team scope is configured for this deployment; change it for your own team. The production function uses Vercel-managed OIDC to resume the existing named backend. Visitor requests cannot create infrastructure or replace a missing database. Provisioning must remain an explicit operator operation.

The backend is independent of GitHub automatic deployments. Review and upload backend changes explicitly, then stop/resume the Sandbox to start the new code; verify health and the creator/buyer workflow. Keep operator credentials out of the repository, browser and logs. Only development testnet operator keys were deployed with the owner's explicit approval.
