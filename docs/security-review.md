# Release security review

Reviewed on November 15, 2026 KST for the testnet prototype at **https://prooflot.vercel.app**. These are targeted engineering checks, not an independent penetration test or a guarantee that the service cannot be compromised.

## Findings fixed before release

- **Dependency vulnerability:** the deployment SDK pulled an older OIDC/CLI configuration dependency affected by the Zod memory-exhaustion advisory [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). Both application and gateway lockfiles now override `@vercel/oidc` to 4.0.9, which uses the patched dependency chain. Both `npm audit` reports show **zero known vulnerabilities**. The updated dependencies were installed on the backend and deployed to the production gateway.
- **Public execution abuse:** the persistent backend now limits mutations to 40 per client per minute, execution starts to eight per client per minute, and total mutations to 600 per hour. The gateway HMACs Vercel's overwritten forwarding header; caller-supplied backend identities are not trusted. A live check confirmed that changing the caller-supplied identity cannot evade the limit. Two concurrent executions remain the maximum. Public listing retests now check capacity before creating a job.
- **Health-check session growth:** health requests no longer create database sessions. A regression test and a live request verified this behavior.
- **Cloud isolation configuration:** the dedicated VM's cgroup hierarchy was corrected so Docker CPU, memory and process limits are actually enforced. A live container verified these limits; none were removed to make execution work.

## Checks completed

- **91 automated tests passed**, zero failures or skips, including actual Docker execution, signature/replay checks, payment entitlement, gateway and rate-limit tests. [Test output](cloud-test-results.txt).
- **No secret matches** in the publishable working files or all Git history blobs scanned. The scan compared known development private keys, the gateway secret and the current OIDC token in memory, plus common key/token patterns. It never printed their values. `.env`, `.vercel`, local data, tool installations and private submission files are excluded from Git. The gateway deployment file list contains only its five application/configuration files. This is a targeted scan, not proof that every possible credential format is absent.
- **Seven live HTTP security check groups passed:** private file routes, security headers, cookie flags, origin/CSRF/body/method rejection, anonymous purchase/download denial, source omission from public reports, and rate-limit enforcement. [HTTP evidence](security-http-evidence.json).
- **Actual runtime isolation:** a non-root Python container had a 128 MiB memory limit, 0.5 CPU and 32-process limit, read-only root, no network access, no application data mount and no inherited server secrets. Linux capabilities are dropped, privilege escalation is disabled and execution/output are bounded. No host execution fallback is provided.
- **Purchased ZIP still works after the security deployment:** the signed test buyer saved and read back the 65,989-byte package. Its SHA-256 remained `733413cf323a2e77054dec0b9d9941010f41cdaa1aacc1b1a84ee69fb00d9c06`. Anonymous and logged-out access were denied. [Saved-package evidence](security-download-evidence.json).
- The full deployed creator-to-buyer workflow previously passed **14 checks** with separate SDK test accounts, including actual testnet payment, wrong terms, duplicate payment, entitlement isolation and fresh Python retesting. [Workflow evidence](cloud-wallet-evidence.json). Earlier Meteor UI evidence is documented separately; no new personal wallet UI approval is claimed here.

## Key custody and remaining boundaries

Personal wallet private keys and recovery phrases are never requested, stored or sent to the application. Creator and buyer transactions are signed by their wallets. Only the two explicitly approved **development testnet operator accounts** are held in the private Vercel Sandbox environment. The gateway secret is a private Vercel environment secret. A compromise of the Vercel account or backend could still expose these operator keys and uploaded bot source. They must never be funded with real assets or reused on mainnet.

This deployment has no mainnet payment or live trading. NEAR proves committed identifiers and purchase state; the operator still controls data collection and execution. The Python service is not an independently audited hostile-code platform. Container/kernel escapes, unknown package vulnerabilities, account compromise, distributed denial of service and quota exhaustion remain risks. The npm audit does not constitute an OS-image or kernel vulnerability audit. Included Vercel Hobby quotas and the explicit request limits can reduce availability.

Before real-money or broader production use, obtain an independent contract/application/sandbox review, harden operator credential separation, add monitored backup/restore and abuse controls, and validate recovery procedures. The current evidence supports a testnet hackathon demonstration, not a claim of production security certification.
