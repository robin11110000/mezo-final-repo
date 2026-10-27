# Surplus

**Put Bitcoin to work on Mezo.**

Surplus is a Mezo testnet application for BTC-backed borrowing, MUSD reserve management, BTC Earn positions and bounded keeper execution. It gives users a path from idle BTC to usable capital, with explicit spending limits and wallet-controlled exits.

[Try Surplus](https://ui-silk.vercel.app/btc) · [Build and security checks](https://github.com/robin11110000/mezo-final-repo/actions/workflows/checks.yml) · [Implementation status](docs/IMPLEMENTATION_STATUS.md)

> Testnet only: Mezo chain **31611**. Borrowing creates debt and liquidation risk; Earn positions lock BTC. This is an experimental prototype, not an audited production application.

## Why Surplus?

BTC held in a wallet provides no application-level utility on its own. Mezo lets a holder use BTC as collateral to access MUSD, or commit a separate BTC balance to an earning position. Managing those choices also requires understanding debt, liquidity, fees and exit conditions.

Surplus connects those decisions in one interface:

1. **Activate BTC:** deposit collateral and borrow MUSD after reviewing fees, debt and the collateral ratio.
2. **Manage capital:** keep a liquid MUSD reserve and allocate permitted surplus to savings.
3. **Manage debt:** add collateral, repay, refinance or close the loan with wallet approval.
4. **Explore another BTC path:** create and manage an independent veBTC lock.
5. **Control execution:** compare MUSD-to-BTC routes and authorize a keeper within an on-chain budget.

These are separate positions and transactions. BTC locked in Earn is separate from loan collateral. Redeeming MUSD for BTC does not repay the user's loan, and savings income is not guaranteed to exceed borrowing costs.

## Explore the application

| Screen | What you can do |
| --- | --- |
| [BTC & loans](https://ui-silk.vercel.app/btc) | Inspect BTC collateral, debt and interest; simulate borrowing; add collateral; borrow more; repay; refinance; close; compare estimated income with borrowing costs |
| [MUSD reserves](https://ui-silk.vercel.app/capital) | Deploy a personal reserve account, fund it, configure spending limits, allocate to savings, return savings, claim yield and withdraw |
| [BTC Earn](https://ui-silk.vercel.app/earn) | Inspect locks, create a BTC lock, extend it, vote on a registered active pool, claim rewards and withdraw when permitted |
| [Keeper & exits](https://ui-silk.vercel.app/execution) | Deploy a redemption account, configure keeper permissions, compare redemption and DEX routes, redeem or swap MUSD for BTC, and inspect liquidation candidates |

Actions depend on wallet balances, approvals, protocol state and available liquidity. A visible action is not a promise of rewards, a successful trade or a profitable keeper job.

## Try it on testnet

1. Open [Surplus](https://ui-silk.vercel.app/btc) in a browser with MetaMask.
2. Select **Connect MetaMask** and approve the Mezo testnet network request. The app selects MetaMask explicitly when another wallet is also installed.
3. Claim test BTC from the [Mezo faucet](https://faucet.test.mezo.org/). Keep some BTC in your wallet for gas.
4. Enter a BTC collateral amount, MUSD draw and minimum collateral target, then choose **Calculate & simulate borrowing**.
5. Review the preview, acknowledge the risk and confirm the transaction in your wallet. The live protocol determines minimum debt and fees.
6. After confirmation, inspect the position and try adding collateral or repaying MUSD. Full closure requires enough MUSD for the repayment amount, including applicable fees and accrued interest.

Wallet-confirmed transactions persist on public testnet. Preview simulations do not. The app never asks for a seed phrase or private key.

## Architecture

Surplus uses a Next.js frontend, two original Solidity account contracts, protocol adapters and one-shot keeper scripts. There is no hosted application API, database or continuously running keeper service. Transaction history is stored locally in the browser.

| Component | Responsibility | Source |
| --- | --- | --- |
| Borrowing adapter | Mezo loan reads, fee-aware previews, insertion hints and borrower transactions | [protocol.ts](ui/src/lib/protocol.ts) |
| Reserve account | Owner-controlled MUSD reserves, savings allocations, withdrawal and yield claims | [WorkingCapitalVault.sol](src/WorkingCapitalVault.sol) |
| Redemption account | Permissioned MUSD-to-BTC execution with actual-spend accounting and minimum-output checks | [BtcRedemptionAccount.sol](src/BtcRedemptionAccount.sol) |
| Savings keeper | Checks policy and simulates or submits one permitted allocation | [keeper-capital.mjs](scripts/keeper-capital.mjs) |
| Redemption keeper | Verifies account identity, plans a bounded redemption and simulates or submits it | [keeper-redemption.mjs](scripts/keeper-redemption.mjs) |
| Earn adapter | veBTC locks, voting and distributor reward claims | [earn.ts](ui/src/lib/earn.ts) |
| Exit and liquidation adapter | DEX quotes/swaps, account redemptions and liquidation simulation | [execution.ts](ui/src/lib/execution.ts) |
| Redemption planner | Stops at the first partial trove and respects minimum remaining debt | [redemption-plan.mjs](ui/src/lib/redemption-plan.mjs) |
| Market checks | Skip BTC/USD and Pyth MUSD freshness, confidence and value checks | [markets.ts](ui/src/lib/markets.ts) |
| Risk calculations | Debt, collateral targets, repayment constraints and estimated net carry | [btc-math.mjs](ui/src/lib/btc-math.mjs) |

### Owner and keeper permissions

Each account has an immutable owner. Owners fund accounts, choose keepers, configure policies and withdraw proceeds. Keepers receive bounded execution permission; they cannot withdraw owner funds or change policy.

- **Savings policy:** liquid reserve, per-allocation cap, remaining budget, cooldown, expiry and activation state.
- **Redemption policy:** reserve, per-execution cap, remaining budget, minimum BTC per MUSD, cooldown, expiry and a keeper fee capped at 1%.
- **Execution checks:** authorization, reentrancy protection, measured token/native balance changes and minimum proceeds. Partial redemptions consume budget and fees based on actual MUSD spent.
- **Owner exits:** revoking or expiring a policy stops keeper execution while preserving owner exit functions, subject to underlying protocol conditions.

The accounts do not provide automatic loan protection. Returning savings, withdrawing MUSD to the owner and repaying a loan require separate transactions in this build. A collateral target guards new borrowing; it does not continuously maintain the position.

## Mezo integrations

| Integration | Current use |
| --- | --- |
| Mezo EVM and RPC | Solidity execution, public reads, wallet transactions and chain checks |
| MUSD borrowing contracts | BTC collateral, MUSD issuance, loan management and liquidation calls |
| HintHelpers and SortedTroves | Insertion hints and bounded redemption planning |
| MUSD Savings | Reserve-account allocations, withdrawals and yield claims |
| Mezo Earn / veBTC | BTC locking, position reads, pool voting and reward claims |
| DEX router and pool factory | MUSD-to-native-BTC quotes and minimum-output swaps |
| Skip and Pyth | Market cross-checks; borrower eligibility uses the protocol's official price feed |

ABIs and runtime identities are recorded in [exports/protocol-testnet.json](exports/protocol-testnet.json), with pinned official repository revisions. Adapters check reviewed runtime hashes, proxy implementation identities and protocol linkages before writes. A mismatch blocks the operation until reviewed.

This is a configuration safeguard, not a formal proof of source equivalence. Protocol proxies can change after an off-chain check and before execution.

## Run locally

Use **Node.js 22** and npm, matching CI.

```sh
git clone https://github.com/robin11110000/mezo-final-repo.git
cd mezo-final-repo
npm ci
npm run build:capital
npm run build:redemption
cd ui
npm ci
npm run dev
```

Open [http://127.0.0.1:3002/btc](http://127.0.0.1:3002/btc). Public protocol addresses are included in the repository; normal browser use requires no server secret.

Build the frontend from `ui/` with:

```sh
npm run build
```

## Tests and verification

Run from the repository root:

```sh
npm run test:security
```

The current suite contains **14 tests**:

| Coverage | Tests |
| --- | --- |
| Borrowing fees, collateral targets, minimum debt, route ranking and estimated carry | 4 |
| Keeper budget, reserve, cooldown, expiry and revocation boundaries | 2 |
| Redemption permissions, partial fills, bounded fees, minimum proceeds and owner exits | 3 |
| First-partial redemption hints and full-to-partial traversal | 2 |
| Reserve-vault policy, withdrawals, dishonest savings responses and reentrancy | 3 |

CI also rebuilds both account artifacts, checks that committed artifacts match compiler output and builds the frontend.

### Browser checks

[test-browser/btc-flow.cjs](test-browser/btc-flow.cjs) covers wallet selection, borrowing, collateral top-up, partial repayment, full closure, Earn reads, redemption-account deployment/funding and mobile overflow. It runs against a local Mezo fork. Ganache cannot execute Mezo's Skip precompile, so this test explicitly substitutes a local BTC oracle. It also seeds local balances; no public transaction is sent.

Browser tests require a running frontend, Playwright (or a `PLAYWRIGHT_MODULE` path), and Microsoft Edge, which the current scripts select. Set `CAPITAL_URL` to your frontend origin: the BTC test otherwise defaults to port 3004, while `npm run dev` serves port 3002. Existing reserve-vault browser tests use local protocol mocks. These scripts are separate from the CI test suite.

### Public testnet simulations

```sh
npm run simulate:btc
npm run simulate:capital
```

These scripts use `eth_call` with temporary helper code and balance/storage overrides against public testnet contracts. They require no wallet signatures and leave no persistent positions or transactions.

Recorded evidence includes:

- **BTC lifecycle, block 16392677:** borrow 2,000 MUSD against 0.1 BTC, add 0.01 BTC, repay 100 MUSD and close; a separate 0.01 BTC lock; bounded redemption and owner withdrawal. The redemption filled approximately 0.0372 MUSD before the first partial trove reached its debt floor. See [btc-lifecycle-simulation.json](exports/btc-lifecycle-simulation.json).
- **Savings lifecycle:** fund with 100 temporary MUSD, allocate 60 with a 40 reserve, revoke automation, unwind and return all 100. See [testnet-lifecycle-simulation.json](exports/testnet-lifecycle-simulation.json).
- **Deployed reserve account:** [0x79169e9A85E46a9f85600E8BE164f767cb88A8Ae](https://explorer.test.mezo.org/address/0x79169e9A85E46a9f85600E8BE164f767cb88A8Ae). The captured account was empty and inactive; its owner, runtime and integration targets were checked. See [deployment.json](exports/deployment.json).

Temporary simulation funding is a test fixture, not earned income. These results do not establish a publicly mined borrower or funded savings lifecycle. Deployment and funding of a new redemption account require the owner's wallet.

## Keeper and developer tools

| Command | Purpose |
| --- | --- |
| `npm run verify:testnet` | Check reviewed testnet integration evidence |
| `npm run preflight:capital` | Compare live savings configuration with reviewed targets |
| `npm run prepare:deploy -- <public-owner-address>` | Prepare an unsigned reserve-account deployment request |
| `npm run keeper:capital` | Check and simulate one permitted savings allocation |
| `npm run keeper:redemption` | Check and simulate one permitted redemption |
| `npm run snapshot:protocol` | Refresh ABI and identity evidence for explicit integration review |

Keepers simulate by default. Sending requires `--send`, an authorized keeper, gas funding and a securely configured local signing key. No hosted scheduler is included. Follow the [keeper runbook](docs/KEEPER_RUNBOOK.md); never commit keys or paste them into chat. Review snapshot changes before committing instead of refreshing them to bypass an upgrade alert.

## Limits and unfinished work

- **No automatic loan defense:** savings recalls and borrower repayment are owner-driven.
- **No bridge or fiat checkout:** native BTC bridging, Wormhole NTT and Banxa remain integration work.
- **No Boar or Matchbox adapter:** reviewed testnet deployments and integration rules are still needed.
- **No savings-gauge staking or emissions automation:** the reviewed savings vault has no configured gauge.
- **No Passport onboarding, concentrated-liquidity management or indexed transaction history.**
- **No independent security audit:** tests and simulation do not replace one. Slither/Echidna runs are also outstanding.
- **Savings trust boundary:** the configured strategy source remains unverified. No APY, future liquidity or guaranteed return is claimed.
- **Transaction limits:** quotes expire, approvals can remain after a later transaction fails, and available liquidity or protocol conditions can change before mining.

See [implementation coverage and security boundaries](docs/IMPLEMENTATION_STATUS.md) for the detailed status.

## Design and documentation

- [Editable Figma file](https://www.figma.com/design/S7zbGVmer45Ih6fUI7emuC): desktop/mobile reserve dashboards and reusable primary button, secondary button, input and metric-card components. This is the earlier reserve design; the Surplus branding and newer BTC, Earn and execution screens have not yet been synced into Figma.
- [Reserve-account behavior](docs/WORKING_CAPITAL.md)
- [Keeper and deployment runbook](docs/KEEPER_RUNBOOK.md)
- [Implementation status](docs/IMPLEMENTATION_STATUS.md)

## License and dependencies

Project code is provided under the [MIT license](LICENSE). The vendored OpenZeppelin dependency subset retains its original license and source notices. Public Mezo ABIs and deployment metadata retain their recorded upstream references; protocol Solidity implementations are not vendored by the new account contracts. See [third-party notices](THIRD_PARTY_NOTICES.md).
