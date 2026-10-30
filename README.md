# Surplus

**Borrow against BTC. Keep a reserve. Put only the surplus to work.**

[Open the testnet app](https://ui-silk.vercel.app/btc) · [Tests and builds](https://github.com/robin11110000/mezo-final-repo/actions/workflows/checks.yml) · [Detailed implementation status](docs/IMPLEMENTATION_STATUS.md)

## What is this?

Mezo already lets you borrow MUSD against your BTC without selling it. Surplus starts with the next question: **what do you do with that MUSD, and how much should stay available?**

You might want some for repayments or other uses, while putting the rest into savings. You might also want a bot to handle routine transactions without giving it unrestricted access to your money.

Surplus gives you a personal MUSD account with rules you choose. You decide how much stays liquid, how much can go into savings, who can execute those transactions and when that permission ends. The account contract checks those rules on every allocation.

The app also brings together Mezo borrowing, BTC Earn positions and MUSD-to-BTC exits. Those integrations help you use existing Mezo products; the account contracts and bounded keeper execution are the main work added here.

**This is a testnet prototype on Mezo, chain 31611.** Borrowing creates debt and liquidation risk. Savings returns are variable, and BTC Earn locks have withdrawal conditions.

## A simple example

Suppose you already have **1,000 test MUSD** and want to keep 400 available.

You fund your Surplus reserve account and set:

| Rule | Your choice |
| --- | --- |
| Keep available | 400 MUSD |
| Maximum savings allocation per transaction | 200 MUSD |
| Total allocation budget | 600 MUSD |
| Time between allocations | Your chosen cooldown |
| Permission expires | Your chosen date |

An authorized bot, called a **keeper**, can then allocate up to 200 MUSD at a time. It cannot allocate below the 400 MUSD reserve, exceed the remaining budget or withdraw your funds. Each successful allocation reduces the budget.

You can revoke the policy. You can also return savings to the account and withdraw to your wallet, subject to the underlying savings contract's conditions.

The 400 MUSD stays in the account, not your wallet. Moving it to your wallet takes a withdrawal transaction. Repaying your loan is another transaction.

## What can I do in the app?

| Screen | What it does |
| --- | --- |
| [BTC & loans](https://ui-silk.vercel.app/btc) | Deposit BTC collateral and borrow MUSD through Mezo. Inspect debt, add collateral, repay, refinance or close. Review fees and estimated borrowing costs. |
| [MUSD reserves](https://ui-silk.vercel.app/capital) | Deploy and fund your account. Set a reserve and allocation limits. Allocate to savings, return savings, claim available yield and withdraw. |
| [BTC Earn](https://ui-silk.vercel.app/earn) | Manage a separate BTC lock: inspect positions, create or extend a lock, vote, claim available rewards and withdraw when eligible. |
| [Keeper & exits](https://ui-silk.vercel.app/execution) | Compare a DEX swap with protocol redemption. Deploy a separate redemption account and set limits on its MUSD-to-BTC execution. There is also a liquidation inspection tool. |

BTC in an Earn lock is separate from BTC loan collateral. A protocol redemption exchanges MUSD for BTC collateral; **it does not repay your own loan**.

## What Surplus adds

Surplus does not introduce a new lending protocol or a new source of yield. It uses Mezo's existing contracts.

The added functionality is in two owner-controlled accounts:

- **Reserve account:** keeps MUSD liquid according to a minimum reserve and permits savings allocations within a cap, total budget, cooldown and expiry.
- **Redemption account:** lets an authorized keeper exchange account MUSD for BTC within spending and minimum-output limits. It measures the MUSD actually spent and BTC actually received, including partial fills. Any keeper fee is capped at 1% and calculated on actual spend.

Keepers cannot change the policy or withdraw owner funds. Revocation and expiry stop keeper execution while preserving owner exit functions.

The redemption planner also stops at the first partially redeemed borrowing position, matching the execution behavior we inspected. A regression test covers the case where continuing traversal would produce the wrong partial-redemption hint.

## Try it

1. Open the [BTC page](https://ui-silk.vercel.app/btc) with MetaMask installed.
2. Connect and approve switching to **Mezo testnet, chain 31611**.
3. Get test BTC from the [faucet](https://faucet.test.mezo.org/). Leave some in your wallet for gas.
4. Enter collateral, the MUSD you want to receive and a minimum collateral target. Select **Calculate & simulate borrowing**.
5. Review the debt and fees, acknowledge the risk and confirm in MetaMask.
6. Use the reserve screen to deploy your own account, approve and fund it with test MUSD, then configure its policy. These are separate wallet transactions.

The preview enforces the live protocol's minimum debt and checks your collateral target. Closing a loan requires sufficient MUSD for the repayment amount, including applicable fees and interest.

Wallet-confirmed transactions persist on testnet. Simulations do not. Surplus never asks for your seed phrase or private key.

## What has actually been verified?

| Area | Evidence and limits |
| --- | --- |
| Borrowing | Borrow, collateral top-up, partial repayment and closure passed a local-fork browser test and a public testnet simulation. Additional borrowing and refinancing have less end-to-end verification. No publicly mined borrower lifecycle is recorded in the committed evidence. |
| Reserves and savings | Contract tests and a public testnet simulation cover funding, allocation, revocation, savings withdrawal and owner withdrawal. An empty reserve account is deployed; a publicly mined funded savings lifecycle is not recorded. |
| BTC Earn | BTC lock creation passed a public testnet simulation. Extension, voting, claims and withdrawal controls are implemented but have not all been verified end to end. |
| Redemptions and swaps | Redemption-account tests and a public testnet redemption/withdrawal simulation passed. DEX execution depends on approval and liquidity; no public trade is claimed. A new redemption account still needs wallet deployment. |

The public simulations use `eth_call` with temporary code and balance/storage overrides. They exercise real testnet contracts but create no persistent positions. Temporary funding is a test fixture, not earned income.

The BTC browser test uses a local Mezo fork with seeded balances and an explicit oracle substitute because Ganache cannot execute Mezo's native Skip precompile.

## Technical overview

The frontend is Next.js/React with ethers and viem. The two account contracts use Solidity 0.8.30 and OpenZeppelin utilities. There is no hosted API, database or continuously running keeper. Browser transaction history is local.

| Part | Code |
| --- | --- |
| Reserve account and savings integration | [WorkingCapitalVault.sol](src/WorkingCapitalVault.sol) |
| Bounded redemption account | [BtcRedemptionAccount.sol](src/BtcRedemptionAccount.sol) |
| Borrowing reads, previews and transactions | [protocol.ts](ui/src/lib/protocol.ts) |
| Savings and redemption keepers | [keeper-capital.mjs](scripts/keeper-capital.mjs), [keeper-redemption.mjs](scripts/keeper-redemption.mjs) |
| Partial-redemption planning | [redemption-plan.mjs](ui/src/lib/redemption-plan.mjs) |
| Earn, DEX and liquidation adapters | [earn.ts](ui/src/lib/earn.ts), [execution.ts](ui/src/lib/execution.ts) |
| Oracle checks and borrowing calculations | [markets.ts](ui/src/lib/markets.ts), [btc-math.mjs](ui/src/lib/btc-math.mjs) |

MUSD is used directly for borrowing, reserve funding, savings and redemption. Earn uses separate veBTC positions. Skip and Pyth provide market cross-checks; borrower operations use Mezo's official protocol price feed. MEZO emissions automation is not implemented.

Protocol ABIs, upstream revisions and reviewed runtime identities are recorded in [protocol-testnet.json](exports/protocol-testnet.json). Adapters check contract identities and linkages before writes. Those off-chain checks cannot prevent a protocol upgrade between a check and transaction execution.

### Run locally

Use **Node.js 22** and npm.

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

Open [localhost:3002/btc](http://127.0.0.1:3002/btc). Public protocol configuration is included; normal browser use needs no server secret.

### Check the implementation

From the repository root:

```sh
npm run test:security
npm run simulate:btc
npm run simulate:capital
```

The **14 automated tests** cover borrowing calculations, keeper policy boundaries, reserve accounting, reentrancy, dishonest savings responses, partial redemption fills, actual-spend fees and minimum BTC proceeds. See [test-node/](test-node/). CI rebuilds account artifacts, checks they match committed compiler output, runs those tests and builds the frontend.

From `ui/`, run `npm run build` to build the app. Browser tests in [test-browser/](test-browser/) require Playwright, Microsoft Edge and a running frontend. Set `CAPITAL_URL` to the frontend origin; the BTC browser test otherwise defaults to port 3004.

Recorded evidence:

- [BTC borrowing, lock and redemption simulations](exports/btc-lifecycle-simulation.json) at testnet block **16392677**.
- [Savings lifecycle simulation](exports/testnet-lifecycle-simulation.json).
- [Deployment evidence](exports/deployment.json) for the reserve account at [0x79169e9A85E46a9f85600E8BE164f767cb88A8Ae](https://explorer.test.mezo.org/address/0x79169e9A85E46a9f85600E8BE164f767cb88A8Ae). The captured account was empty and inactive.

Keepers simulate by default. Sending requires explicit `--send`, an authorized signer and gas. Setup and signing-key handling are described in the [keeper runbook](docs/KEEPER_RUNBOOK.md).

## What is still missing?

Automatic loan protection is unfinished: the keeper cannot recall savings and repay your loan for you. The borrowing target is a check at entry, not continuous protection.

Native BTC bridging, Wormhole, Banxa, Boar, Matchbox, Passport, savings-gauge staking and MEZO emissions automation are not connected. They are not part of the working demo.

The contracts have not had an independent security audit. The configured savings strategy source remains unverified. Tests do not establish future liquidity, returns or production safety. Quotes can change, and a failed second transaction can leave a token approval active.

The next milestone is a recorded, wallet-signed public testnet journey from BTC borrowing through savings allocation, withdrawal and repayment. See [implementation status](docs/IMPLEMENTATION_STATUS.md) for the full boundary.

## More information

- [Account behavior](docs/WORKING_CAPITAL.md)
- [Keeper runbook](docs/KEEPER_RUNBOOK.md)
- [Buildathon brief and submission focus](docs/BUILDATHON_CONTEXT.md)
- [Editable Figma file](https://www.figma.com/design/S7zbGVmer45Ih6fUI7emuC). It contains the earlier reserve dashboard and reusable components; the newer Surplus screens have not yet been synced.

## License

[MIT](LICENSE). Dependency licenses and source notices are retained; see [third-party notices](THIRD_PARTY_NOTICES.md).
