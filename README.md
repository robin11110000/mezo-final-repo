# Surplus

Put BTC to work on Mezo testnet. Surplus brings together BTC-backed MUSD borrowing, independent veBTC earning positions, owner-controlled MUSD reserves and bounded keeper redemptions.

Live prototype: https://ui-silk.vercel.app/btc

## BTC product paths

- `/btc`: BTC/debt snapshot, borrowing preview including fees and gas compensation, collateral top-up, additional borrowing, repayment, refinancing and closure. Repayment planning respects minimum debt. Net-carry scenarios show loan costs separately from assumed savings income.
- `/capital`: the existing MUSD reserve/savings account. Return savings to reserve, then withdraw to the owner before loan repayment. These are separate transactions.
- `/earn`: inspect veBTC locks, approve/create a BTC lock, extend, vote on an active pool, claim distributor rewards and withdraw when permitted. BTC locked here is separate from BTC collateral in a loan.
- `/execution`: deploy/fund a separate bounded redemption account, configure keeper limits, compare redemption and DEX routes, execute minimum-output redemptions, swap wallet MUSD and inspect/simulate liquidation jobs.

Adapters check pinned runtime hashes, implementation addresses/hashes and core protocol linkages before protocol writes. This detects changes against a reviewed snapshot; it is not a formal audit or proof of upstream source equivalence. Borrowing creates debt and liquidation risk. The collateral target is an entry guard, not continuous protection.

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
npm run build:redemption
npm run test:security
cd ui
npm ci
npm run dev
```

Open http://127.0.0.1:3002/btc in a browser with MetaMask. Connect to Mezo testnet, chain **31611**, and use test assets only. Claim test BTC at https://faucet.test.mezo.org/ to pay gas. The app never requests a seed phrase or private key.

## Verification

Contract/keeper tests cover authorization, reserves, budgets, expiry, cooldown, reentrancy, dishonest receipts, partial redemption fills, keeper fees, minimum BTC received and debt-floor calculations. The frontend production build passes. Existing browser tests cover the MUSD vault lifecycle using mocks.

`npm run simulate:btc` uses an ephemeral helper and state overrides against real testnet contracts. At block **16392677**, opening a loan with 0.1 BTC and drawing 2000 MUSD, adding 0.01 BTC, repaying 100 MUSD and closing all succeeded. A separate 0.01 BTC veBTC lock and a bounded account redemption/owner withdrawal succeeded. The redemption consumed approximately 0.0372 MUSD before the first partial trove reached minimum debt. MUSD override funding covers fees needed for closure; it is not income. No public transaction was broadcast. See `exports/btc-lifecycle-simulation.json`.

A separate live Mezo testnet `eth_call` successfully funded an ephemeral vault with 100 simulated MUSD, allocated 60 while preserving a 40 reserve, revoked automation, unwound savings and returned all 100. No public transaction was broadcast. See `exports/testnet-lifecycle-simulation.json`.

A deployed owner-controlled testnet savings account is verified at [`0x79169e9A85E46a9f85600E8BE164f767cb88A8Ae`](https://explorer.test.mezo.org/address/0x79169e9A85E46a9f85600E8BE164f767cb88A8Ae). The captured position is empty and inactive. Its executable build, owner and integration targets match `exports/deployment.json`. A mined borrower lifecycle and deployment/funding of a new redemption account still require the owner's wallet. Savings strategy source remains unverified; no APY or guaranteed yield is shown. Bridging, fiat ramps, savings-gauge staking and automatic loan defense are not implemented.

## Tools

```sh
npm run verify:testnet
npm run preflight:capital
npm run simulate:capital
npm run prepare:deploy -- <public-owner-address>
npm run keeper:capital
npm run keeper:redemption
npm run simulate:btc
```

See [account behavior](docs/WORKING_CAPITAL.md), [keeper/deployment instructions](docs/KEEPER_RUNBOOK.md) and [implementation coverage](docs/IMPLEMENTATION_STATUS.md). Browser tests under `test-browser/` require Playwright or a `PLAYWRIGHT_MODULE` path and a running frontend. Their transactions stay on an isolated local EVM. The BTC browser test uses a local protocol fork with an explicit native-oracle override because Ganache cannot execute Mezo's Skip precompile.

`npm run snapshot:protocol` fetches ABIs from pinned official repository revisions and records live testnet runtime identities. This is an explicit integration-review operation: inspect changes before committing, and do not refresh blindly to bypass an upgrade alert.

Native bridges, Wormhole NTT, Banxa, Boar, Matchbox, Passport onboarding, gauge staking, emissions automation, indexing and independent security-tool runs remain documented integration work. The UI identifies these as unavailable/planned rather than exposing fabricated testnet routes.

The vendored OpenZeppelin dependency subset includes its original license. See [dependency notices](THIRD_PARTY_NOTICES.md).
