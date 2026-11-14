# Prooflot: judge walkthrough

Bot creators can sell what they tested. Buyers can inspect losses and limitations, purchase the exact version, save its source, and run it again. NEAR binds the creator, version, report, terms, payment and license. It does not independently execute or certify the backtest.

## Start from a fresh checkout

Requires Node.js 24.x. Python bots additionally require Docker Desktop with the image below; rule bots and examples work without Docker, API keys or wallets.

```sh
npm ci
npm run build
npm test
npm start
```

Open `http://127.0.0.1:4317`. A fresh checkout runs in **Local demo** mode because private operator credentials are not distributed. The first-visit introduction appears once; **Replay intro** opens it again.

1. **Register bot → Rules**. Enter `Judge Momentum`, version `1.0`, leave threshold `100` and lookback `12`. Confirm that you have rights to the bot, then **Register & test**.
2. Keep the synthetic example and select **Start backtest → View results**. Observe the actual return, drawdown, fill count, baselines and measured checks. Synthetic data is explicitly labeled.
3. In the report, **List this bot → Publish listing**. This opens its product page. Local mode says **simulated NEAR**, and performs no blockchain payment.
4. **Try example purchase → Get example license**. Open **My library → Download → Download file**. The default uses a regular browser download. Chromium also offers **Choose location & verify**, which reads back the saved bytes. Download-request status alone does not claim disk completion.
5. Extract the ZIP. Run `node verify.mjs` from the extracted folder. For an independent expected-version comparison, run `node verify.mjs . <version-hash-from-the-product>`.
6. **Retest** in the library. A new run executes the purchased version against the same frozen data. This differs from **Replay decisions**, which only recalculates a recorded decision sequence.
7. **Compare two bots** runs fresh Atlas versions on equal conditions. **Benchmarks** executes four fixed BTC/ETH cases and retains failed attempts as well as completed ones. Historical data import needs internet access.

## Check the real NEAR transactions

These read-only commands need internet access, but no wallet, private key, API key or running application:

```sh
node scripts/check-wallet-proof.mjs
node scripts/check-meteor-proof.mjs
node scripts/check-benchmark-proof.mjs docs/wallet-benchmark-evidence.json
node scripts/check-wallet-proof.mjs docs/final-wallet-evidence.json docs/final-product-evidence.json
```

The published evidence includes real creator and buyer SDK signatures, rejected altered terms, rejected duplicate payment, exact seller credit and a completed creator withdrawal. The personal Meteor buyer test was also completed through the wallet UI. Evidence labels distinguish this from the separate SDK test accounts. Creator wallet UI and Nightly approval were not directly tested.

## Use your own testnet wallet

The prepared developer workspace connects to `agentproof-060206eead.testnet`. A fresh clone must configure its own operator with `npm run testnet:setup` on Windows (DPAPI), then restart. The setup script creates testnet resources; it never deploys to mainnet. See the README for contract builds.

Prepare a NEAR testnet wallet in Meteor or Nightly and fund it with test tokens. Keep at least 0.5 test NEAR for the demo to cover wallet gas/reserve checks. Connect it in the app and sign the NEP-413 login. Creator publication and buyer payment are explicit wallet signing requests. A 0.01 test NEAR license requests 0.03 test NEAR plus gas, including the 0.02 storage allowance. Unused storage credit is withdrawable from the wallet menu. An existing license can be recovered without paying again.

## Python execution

```sh
docker pull python:3.12-slim-bookworm@sha256:935c3c5b12357a7e10caa9c1e6ca5692344d97cf229832ef584be2cec9fc03df
```

Upload `examples/momentum.py`, or choose **Python → Paste your code → Use example code**. The `decide(observation)` function receives closed candles and returns BUY, SELL or HOLD. Containers use no network or host mounts, a read-only root, non-root user, dropped capabilities and bounded CPU, memory, time and output. This is not an independently audited hostile-code hosting service.

## What is proved, and what is not

The chain establishes version/terms identity, signed purchase state and creator credit. The portable verifier establishes file integrity and source/report/license bindings against the expected version. Data collection and execution truth remain operator-attested. Four public historical tests are not hidden holdouts, and a small number of fills cannot establish future performance. Negative results remain visible. No live trading, real-money custody or profitable-bot claim is made.
