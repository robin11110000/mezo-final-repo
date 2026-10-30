# Buildathon brief and submission focus

Reviewed October 30, 2026. This note separates published requirements from our interpretation. It does not describe a known private judging prompt.

## Published information

The [official October buildathon brief](https://mezo.org/blog/mezo-buildathon-is-underway/) describes DeFi and Access & Distribution tracks. It requires an MUSD and/or MEZO integration and a working deployment; Mezo testnet is allowed. For the first wave, it asks teams to explain the core experience, the asset integration and how someone can try the product. New projects and extensions are allowed.

The [kickoff workshop page](https://luma.com/mezo-buildathon) says submissions are judged directly by the Mezo core team. We have not verified AI-only judging, a private bot prompt or numerical scoring weights for this edition. The [AKINDO event page](https://app.akindo.io/wave-hacks/OVOO0gdrVU8379D10/) is the entry point for event details, but its overview was not readable through the text retrieval used in this review. Do not substitute another event's rubric.

## How this applies to Surplus

Surplus fits the DeFi track through direct MUSD reserve, savings and redemption operations. BTC borrowing is Mezo functionality; the new account contracts and their bounded permissions are the submission's main technical contribution. The repository does not establish a new category or a winning outcome.

The README should let a reviewer answer these questions with evidence:

| Question | Where to check |
| --- | --- |
| Who is this for, and what problem does it solve? | README explanation and reserve example |
| What does MUSD actually do in the product? | Account contracts, protocol adapter and recorded simulations |
| What did this project add to the underlying protocol? | Reserve/redemption accounts, keepers and partial-redemption planner |
| Can someone try the main flow? | Deployed app, wallet instructions and current verification table |
| Are permissions and exits enforced? | Solidity checks and adversarial contract tests |
| Can the claimed results be reproduced? | Setup commands, test scripts, compiler artifacts and exports |
| What remains incomplete? | README limitations and IMPLEMENTATION_STATUS.md |

These are our review questions inferred from the brief and normal implementation review, not an official scoring rubric or a reconstruction of an actual bot prompt. Human or automated review should be able to trace claims to code, tests and evidence. No evaluation instructions or score requests are embedded in the README.

## Main evidence gap

The recorded public RPC checks use temporary state overrides and do not prove a mined user journey. Local browser tests use fixtures. A wallet-signed public testnet demonstration, with receipts for borrowing, allocation, withdrawal and repayment, remains the clearest next proof of the core flow.
