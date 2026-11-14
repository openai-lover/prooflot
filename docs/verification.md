# Verification — Prooflot 0.2

Updated 2026-11-14. Counts describe different layers; they are not independent security certification.

| Layer | Result | Evidence |
|---|---|---|
| JavaScript, SQLite, HTTP and real Docker | 84 passed, 0 skipped | test-results.txt |
| Separate creator/buyer testnet workflow | 14 passed | wallet-testnet-evidence.json |
| Actual Meteor Web buyer, ZIP and fresh retest | 16 recorded checks passed | meteor-wallet-evidence.json |
| Independent Meteor purchase public proof | 10 passed | scripts/check-meteor-proof.mjs |
| Public wallet proof against FINAL RPC state | 14 passed | scripts/check-wallet-proof.mjs |
| ZIP download and entitlement isolation | Source, artifact hash, report hash and buyer match; anonymous/logout access denied | wallet-download-evidence.json |
| Wallet-owned Python fixed benchmark | 4/4 completed, 628 decisions, 42 fills | wallet-benchmark-evidence.json |
| New benchmark public proof | 8 passed | scripts/check-benchmark-proof.mjs |
| Existing NEAR contract VM tests | 10 previously passed; source/WASM unchanged | prior contract build results |
| Historical developer testnet workflow | 11 previously passed | testnet-evidence.json |

## Wallet authorization and payment

The test client used separate creator and buyer keys, authenticated through NEP-413, and submitted real signed testnet transactions. The application HTTP server did not sign those creator/buyer actions. Keys stayed in the client process and a Windows CurrentUser DPAPI file, excluded from the package.

The unit/HTTP checks reject changed messages, wrong account/origin/browser session, expired/reused/concurrent challenges, FunctionCall-only keys, revoked keys and non-testnet responses. A stable account identity restores private records in a new browser session. Logout removes authorization.

The real contract rejected changed terms and duplicate payment. The app rejected forged success, wrong version and unauthenticated requests. Seller credit increased by exactly the listing price; duplicate payment did not increase it. Creator withdrawal completed. A buyer downloaded the exact artifact, other accounts were denied that entitlement, and the same wallet recovered it without re-paying.

The buyer's fresh Python process made 61 decisions with entirely new call IDs. Decisions and simulated results matched the original deterministic test bot: −0.98%, 1.54% maximum drawdown, five fills on 72 hourly BTC/USD candles. This is one historical result, not profitability evidence. General stateful/nondeterministic bots need not reproduce decisions.

## Download package

The authenticated ZIP contains bot.py, bot.json, license.json, report.json and README.txt. The Windows System.IO.Compression reader successfully opened every entry. Python source equals the registered artifact source; the version, report and buyer equal the purchase evidence. Fixed entry names reject uploaded paths. The original JSON endpoint remains available.

## Public verification without secrets

~~~sh
node scripts/check-wallet-proof.mjs
node scripts/check-meteor-proof.mjs
node scripts/check-benchmark-proof.mjs docs/wallet-benchmark-evidence.json
~~~

The wallet verifier checks testnet, report content, creator ownership, version/terms/report/manifest bindings, completed settlement, exact price and purchase arguments, buyer license/signature, deployed WASM and creator withdrawal. It requires neither app server nor DPAPI files.

The new wallet-owned Signal Check benchmark produced returns −1.74%, −0.34%, −4.96%, +2.02%, with 7, 10, 11 and 14 fills. All cases are retained; independent returns are not added together. The earlier Momentum Python benchmark and its 17 fills remain preserved separately in benchmark-evidence.json.

## Browser verification

First automatic introduction, progression through three scenes, skip, replay and absence on reload were checked. Desktop and 390-pixel mobile layouts were inspected; mobile product content has no document overflow. The UI exposes the actual creator address, four publication transaction links, successful FINAL recheck and explicit testnet purchase conditions. The wallet chooser, Meteor connection screen and cancellation were exercised without console errors.

**Real Meteor Web buyer flow completed.** The user prepared and unlocked nearblog6709.testnet in Meteor. The app received a real NEP-413 signature and verified the account's key, then Meteor signed purchase_license with a 0.03 test NEAR deposit. Transaction 5okSTWEwmR7BR8Yzao1uV5R1sT4LHrbBvtoKoK6Nt92L reached FINAL success and created license 2e8e802e-89f9-496c-932f-7797a5fd6974. The browser downloaded the ZIP and launched a new 61-decision Python run, 752f6e00-b122-4af8-98f9-477dd5a0a222. Windows ZIP parsing verified source/version/report/buyer; new call IDs and identical deterministic results confirmed fresh execution. The independent public verifier passes 10 chain checks; it does not independently attest UI actions or execution.

This test exposed and corrected the popup's about:srcdoc page URI and stale adapter cache version. Login and payment now open from an explicit app button, and an already connected wallet can proceed directly to login signing. An initial 0.1 test NEAR balance was insufficient for Meteor's approximately 0.131 minimum balance check; the license was absent before topping up to 0.5 and retrying. The successful transaction burned 0.000272857720189 test NEAR across its outcomes. Funding transactions and the failed preflight are recorded separately from the successful personal purchase.

The earlier automatic-review blocks on entering Meteor and beginning wallet setup were resolved through explicit user authorization and direct user setup. No secret was entered by the agent. Creator publication/withdrawal were verified with the separate SDK accounts; creator wallet UI approvals and the Nightly extension interaction remain unverified.

Reduced motion is supported in CSS/intro logic; no OS motion-preference change was made during browser QA. First-visit caching is per browser storage, not a unique-person identity across devices.

### Full-screen introduction redesign

The revised introduction was exercised in the actual local browser. A fresh localhost origin opened automatically and reached the final scene without closing. Pause held the exact same progress value across subsequent checks; the replay control restarted the timeline. Skip followed by reload left the intro closed, and the decorative image had no `src` on that cached visit. Footer replay opened the dialog, focused Skip, and restarted at chapter one. ArrowRight moved to chapter two; Escape closed the dialog and restored focus to the footer replay button. Both CTA buttons closed the dialog and navigated to the intended market or creator studio view. The test tab had no console errors.

Desktop 1266 × 883 and 1280 × 720, mobile 390 × 844 and mobile 375 × 667 layouts were inspected. Both mobile sizes had matching client/scroll width and height, with all action/timeline buttons inside the viewport. A horizontal overflow found during development was corrected. The report uses actual Signal Check example metrics and curve points. The native reduced-motion branch was reviewed but the OS preference was not changed for testing.

`node --test tests/http.test.mjs` passed all 8 tests after allowing loopback access; the initial sandbox-only attempt was blocked by EACCES. The live server returned HTTP 200 and correct MIME types for HTML, intro JavaScript/CSS, the PNG and the local WOFF2. See `intro-ui-evidence.json` and the `intro-v2-*.jpg` screenshots. This visual change did not repeat wallet payments or live chain mutations.

### Unified product UI — November 14

The introduction, market, studio, reports, product, checkout and library now share the local Pretendard font, glass asset and card/button styling. Intro CTAs use a shared-object transition where supported, finish on the requested view, and focus its heading. First-visit caching and manual replay remain intact. The studio preserves code when switching formats and updates the draft name/version preview; no creator submission was made for this visual pass.

Actual existing Signal Check results were displayed: −0.98%, 1.54% drawdown, five fills, all eight inspection items. All warning titles and exact purchase conditions remain available. The mobile product puts measured results and warnings before purchase, with technical proof below. Checkout showed 0.01 + 0.02 = 0.03 test NEAR, with gas separate. A local MIT example was acquired without a chain payment, appeared in the library and completed a fresh 73-decision retest. Its product then linked to the existing license instead of another purchase.

The 1920 × 945 desktop, 390 × 844 mobile and 320 × 667 small mobile layouts were inspected. Horizontal overflow in the narrow hero was corrected. The viewport override was reset, no application console errors were observed, and the normal local market was left open. `node --test tests/presentation.test.mjs tests/http.test.mjs` passed 11/11 after permitting loopback networking; the sandbox-only attempt encountered EACCES. JavaScript syntax checks passed. This pass did not repeat personal-wallet transactions or change the contract.

The browser did not surface a completion event for the local ZIP download, and browser policy blocked inspecting its internal downloads page. This pass does not claim a newly saved file; the HTTP suite verifies entitled artifact delivery, while the earlier real Meteor ZIP evidence remains separate. Reduced-motion and unsupported-API fallback branches were reviewed without forcing those browser settings. See `product-ui-evidence.json` and its listed screenshots.

## Remaining boundaries

Report execution and market data remain operator-attested. No independent sandbox/security audit, public hosting, independent user study, forward trading or production financial deployment was performed. Repository/video publication is recorded in the release section below; final contest submission requires its own saved receipt. No paid/live LLM call or provider billing bound was verified. Private keys, live datasets and SQLite sessions are excluded from the submission ZIP.


## Release verification — November 14

The fresh separate-account workflow passed all 14 checks again for Signal Check v1.1. See final-wallet-evidence.json. Its purchased ZIP was written to disk, read back, checked against the HTTP checksum and expected version, extracted, and verified offline. Anonymous access and access after logout were rejected. See final-download-evidence.json.

The Chrome UI also saved the Atlas package to the real Windows Downloads folder and to output/browser-saved-atlas.zip. Both files were 72,044 bytes with SHA-256 FC1B3C65FBE64C313E78C8B79BFEE310253CE4AAED4EE05391472EDE344F111A. The extracted package passed the offline verifier. Screenshot: screenshots/download-saved-en.png. This supersedes the unconfirmed browser-save limitation in the earlier product-ui-evidence.json; that historical record is retained.

## Prooflot in-app release

The complete creator-to-buyer flow was repeated in the ChatGPT in-app browser using a real uploaded Python file. All 73 decisions completed, a 0.01 simulated NEAR listing was purchased, the browser download event returned the actual Windows Downloads path, and the 73,387-byte ZIP was read back and verified offline (six manifest files; source/report/license binding). A new Python retest completed all 73 decisions. See prooflot-browser-evidence.json. The default download now uses the browser download manager; choosing a specific location and verifying the disk write remains an optional action because the embedded browser file picker can stall.

The latest full suite passed 84/84 tests with Docker enabled and zero skipped tests. The release name is Prooflot; historical evidence is retained under its original identifiers.

## Public release — November 14 UTC

The source is public at https://github.com/openai-lover/prooflot. An anonymous fresh clone of commit d943ff9 completed dependency installation, browser build and all 84 tests with Docker enabled (zero failures or skips). The published source was tested separately from the prepared operator workspace. See public-clone-test-results.txt.

The actual 89-second product recording is public at https://youtu.be/OEni-eWBdwk on SLIME CEO!. It shows real in-app browser actions: Python registration and execution, inspection, a clearly labeled local simulated purchase, browser download and a fresh retest, followed by live verification of a previously recorded real testnet listing and its four benchmark outcomes. English captions distinguish local simulation from NEAR FINAL verification. This recording does not show a new personal-wallet approval. The saved file's bytes and bindings are documented in prooflot-browser-evidence.json.

The approved demo was also published at https://x.com/AlphaGgang/status/2121637337587458332 with its embedded video, public repository link and required hackathon tags. Public source and video do not establish contest acceptance; the final application requires its own saved receipt.

## Submission receipt

After explicit approval of the exact JSON payload and contact notice, one application was sent to the official API. It returned HTTP 201 at 2026-11-14T16:17:50.888Z (November 15, 01:17:50 KST), with an empty response body. The approved tracks were Open Innovation and Agent Economy. The full receipt and personal payload remain local and Git-ignored; publication-evidence.json contains only non-personal status metadata. Receipt does not establish judging eligibility or an award. No second application was submitted.
