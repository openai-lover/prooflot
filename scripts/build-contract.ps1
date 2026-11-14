$ErrorActionPreference = 'Stop'
$contractPath = (Resolve-Path (Join-Path $PSScriptRoot '..\contracts')).Path
$image = 'rust:1.95.0-slim-bookworm@sha256:d7482085ff5b415f84dba5647ae71606650bdef00db7aeb69f4b3d170c3e4082'
docker run --rm --name agentproof-rust-build --mount "type=bind,source=$contractPath,target=/work" --mount type=volume,source=agentproof-cargo-cache,target=/usr/local/cargo/registry --mount type=volume,source=agentproof-rust-target,target=/work/target -w /work $image sh -c 'rustup target add wasm32-unknown-unknown && cargo test --locked && cargo build --locked --target wasm32-unknown-unknown --release && mkdir -p /work/build && cp target/wasm32-unknown-unknown/release/agentproof_registry.wasm /work/build/agentproof_registry.wasm'
if ($LASTEXITCODE -ne 0) { throw 'Contract build failed' }
