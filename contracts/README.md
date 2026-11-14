# AgentProof NEAR testnet contract

Built and deployed to agentproof-060206eead.testnet. Rust 1.95.0, near-sdk 5.30.1, locked dependencies. Not audited.

Use ../scripts/build-contract.ps1 (Docker) or cargo test --locked and cargo build --locked --target wasm32-unknown-unknown --release. The target configuration in .cargo/config.toml must remain present: --cfg near enables NEAR host behavior in this SDK.

10 Rust tests cover settlement conservation/idempotency, overcharging, version and terms mismatch, creator ownership, operator permission, purchase crediting, duplicate purchase, cancellation expiry and failed-withdrawal recovery. Live chain evidence is in ../docs/testnet-evidence.json.

State: creator versions, evaluation jobs, result commitments, listings, buyer licenses, credit/pending withdrawals. Storage deposits are distinct from service deposits. Transfers zero credit first and restore it after a failed private callback. Native transfer return data is bounded to zero bytes.

Operator-attested reports are trusted inputs. Testnet deployment and passing tests do not certify production financial safety.
