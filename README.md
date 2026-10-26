# MUSD Working Capital

A testnet-only MUSD account that preserves a liquid reserve and lets authorized keepers allocate surplus into Mezo savings within owner-defined limits.

## Features

- Separate savings position for each owner.
- On-chain reserve, per-action cap, cumulative budget, cooldown, expiry and revocation.
- Owner-controlled withdrawals, savings unwinds and yield claims.
- Exact token approvals, allowance clearing, balance/receipt checks and reentrancy protection.
- MetaMask selection even when another browser wallet is the default.
- Wallet deployment, policy editing, funding, allocation and transaction receipts.
- Vault bytecode and savings implementation verification.
- One-shot keeper: read-only simulation by default, explicit sending mode.

## Run

```sh
npm ci
npm run build:capital
npm run test:security
cd ui
npm ci
npm run dev
```

Open http://127.0.0.1:3002/capital in a browser with MetaMask. Connect to Mezo testnet, chain **31611**, and use test assets only. Claim test BTC at https://faucet.test.mezo.org/ to pay deployment gas. The app never requests a seed phrase or private key.

## Verification

Five contract/keeper tests passed. The frontend production build and desktop/mobile checks passed. The browser workflow completed deployment, funding, allocation, revocation and withdrawal against an isolated local EVM using mocked protocol contracts.

A separate live Mezo testnet `eth_call` successfully funded an ephemeral vault with 100 simulated MUSD, allocated 60 while preserving a 40 reserve, revoked automation, unwound savings and returned all 100. No public transaction was broadcast. See `exports/testnet-lifecycle-simulation.json`.

A deployed owner-controlled testnet vault is verified at [`0x79169e9A85E46a9f85600E8BE164f767cb88A8Ae`](https://explorer.test.mezo.org/address/0x79169e9A85E46a9f85600E8BE164f767cb88A8Ae). The captured position is empty and inactive. Its executable build, owner and integration targets match the deployment record in `exports/deployment.json`. A mined funded lifecycle still requires the owner's wallet. The savings strategy source remains unverified; no APY or guaranteed yield is shown. Borrowing, bridging, fiat ramps and savings staking are not implemented.

## Tools

```sh
npm run verify:testnet
npm run preflight:capital
npm run simulate:capital
npm run prepare:deploy -- <public-owner-address>
npm run keeper:capital
```

See [account behavior](docs/WORKING_CAPITAL.md) and [keeper/deployment instructions](docs/KEEPER_RUNBOOK.md). Browser tests under `test-browser/` require Playwright or a `PLAYWRIGHT_MODULE` path and a running frontend. Their transactions stay on an isolated local EVM.

The vendored OpenZeppelin dependency subset includes its original license. See [dependency notices](THIRD_PARTY_NOTICES.md).
