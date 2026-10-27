# Workshop implementation coverage

The application targets Mezo testnet 31611 only. A UI control or contract artifact does not establish a successful public mined lifecycle. Recorded live simulations use `eth_call`, temporary code/balance overrides and no signatures/broadcasts.

## Implemented

| Resource | Behavior | Verification boundary |
| --- | --- | --- |
| Mezo EVM / mezod RPC | Solidity accounts, ethers/viem reads, chain checks and wallet transactions | Fixed testnet 31611 |
| MUSD / BorrowerOperations | Open trove, collateral top-up, additional borrowing, repayment, refinance, close | Real testnet borrow/top-up/repay/close simulation; wallet UI |
| PriceFeed / Skip | Protocol price for eligibility; fresh native BTC/USD cross-check | Native oracle used by live read-only simulation |
| Pyth | Freshness, confidence, exponent and bounds checks for configured MUSD feed | Stale/unavailable feed never becomes a fabricated $1 price |
| HintHelpers / SortedTroves | Approximate/exact insertion hints and bounded redemption hints | Source-pinned ABI; simulation before sending |
| MUSD Savings | Reserve vault deposits, withdraws and yield claims | Real testnet lifecycle simulation; unverified strategy is a limitation |
| Mezo Earn / veBTC | Lock creation, position reads, extension, voting, distributor claims and unlocked withdrawal | Real testnet lock simulation. Other actions depend on current state |
| DEX | Structured route quote, exact approval and minimum-output wallet swap | Depends on pool liquidity/approval; no public trade claimed |
| Liquidations | Protocol price/MCR eligibility and fresh batch simulation | No public liquidation/profitable keeper job claimed |
| Redemption keeper | Owner account with allowlist, reserve, budget, cap, minimum BTC rate, fee cap, cooldown, expiry and revocation | Local adversarial tests and live testnet redemption/withdrawal simulation; public deployment still required |
| UI / wallets | Explicit MetaMask discovery and four connected screens | Account/chain rechecked before writes |
| Economics | Fees/gas debt, minimum-debt repayment planner and net-carry scenario | Savings APR is user input |

## Outstanding integrations

| Topic | Required before implementation/activation |
| --- | --- |
| Native bridge | Supported Bitcoin test network, current bridge contracts/API and asynchronous proof/deposit tracking |
| Wormhole NTT | Verified source/destination testnet managers/transceivers/token mappings and recovery flow |
| Banxa | Partner sandbox credentials, supported chain/token, checkout and webhook verification |
| Matchbox | Reviewed testnet deployment, ABIs and incentive/boost economics |
| Boar Finance | Verified testnet vault, fees, withdrawal constraints and receipt semantics |
| Savings gauge | Configured testnet savings vault reports zero gauge in reviewed evidence |
| MEZO emissions | Reviewed token-launch deployment and reward accounting; no assumption that direct fee yield and emissions stack |
| Concentrated liquidity | NFT position adapter, price-range policy and exit accounting |
| Passport | Official dependency and tested Bitcoin-wallet signing/account compatibility; current app uses MetaMask |
| Indexing | Goldsky project/deployment and backfill; current browser history is local |
| Automatic loan defense | Exact signed borrower authorization or reviewed position-owning account, bounded MUSD spending and savings-recall permissions |
| External security review | Slither/Echidna runs and independent review; current tests are not a formal audit |

## Mid-implementation security review

Repayment, system redemption and liquidation remain separate operations. `getEntireDebtAndColl` already adds pending amounts; adapters do not add them twice. Issuance fees/gas compensation contribute to total debt. Partial repayment honors minimum debt; insertion-hint principal accounting pays interest first. New borrowing/expansion checks the owner's target before simulation.

The new non-upgradeable redemption account is testnet-only. It checks token/native balance deltas, actual-spend budgets/fees, minimum BTC rate and minimum output, including partial fills. Keeper authorization cannot change policy or withdraw. Owner exits remain available after expiry/revocation. Protocol proxies can still change between checking and execution; off-chain pinning is not an on-chain guarantee against intervening upgrades.

Exact approvals may remain after a second transaction fails; the UI explains this. External oracle quotes do not enforce future prices. On-chain bounds and fresh simulation are required for execution. Savings recalls and owner loan repayment are separate transactions and require owner signatures in this build.

Redemption hints stop at the first partial fill, matching TroveManager execution. A regression fixture verifies that the planner cannot overwrite this NICR with a later trove's hint. Iterations are bounded, and the smallest debt-floor fill can make a nominally large redemption uneconomic. Compare actual filled MUSD and BTC instead of assuming the requested amount is filled.

## Evidence

`exports/protocol-testnet.json` records pinned official revisions and live identities. `exports/btc-lifecycle-simulation.json` records real-testnet borrow/lock simulations. Existing savings/deployment evidence remains in `exports/` and `integrations/testnet/`.

Official references: https://github.com/mezo-org/musd · https://github.com/mezo-org/tigris · https://github.com/mezo-org/mezod · https://mezo.org/docs/developers/
