# Third-party dependencies

The Solidity files under `lib/openzeppelin-contracts/contracts/` are the dependency closure needed by this vault and its test token. They come from OpenZeppelin Contracts 5.4.0, revision `c64a1edb67b6e3f4a15cca8909c9482ad33a02b0`. Their MIT license and source notices are retained in place; see `lib/openzeppelin-contracts/LICENSE`.

JavaScript dependencies retain their respective licenses in their installed distributions. `integrations/testnet/evidence.json` contains public protocol explorer source/ABI evidence; source notices remain part of that evidence.

`exports/protocol-testnet.json` and its UI copy contain public contract ABIs and deployment metadata acquired from the official `mezo-org/musd` and `mezo-org/tigris` repositories at recorded revisions. Each ABI retains its upstream artifact URL. These are integration metadata rather than copied Solidity implementations. Upstream GPL-3.0 / GPL-3.0-or-later source license requirements apply if those implementations are copied or modified. The new account contracts do not vendor that source code.
