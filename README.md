# Randomness

[![codecov](https://codecov.io/gh/bogachevanton/randomness/branch/main/graph/badge.svg)](https://codecov.io/gh/bogachevanton/randomness)
[![Tests](https://github.com/bogachevanton/randomness/actions/workflows/codecov.yml/badge.svg)](https://github.com/bogachevanton/randomness/actions/workflows/codecov.yml)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

On-chain VRF-based random number generation for the Stacks blockchain.

**Strike | [skullco.in](https://skullco.in)**

## Contracts

| Contract | Description |
|---|---|
| `rng-traits-v1` | Stable trait definitions (`rng-operator-trait`, `rng-core-trait`) |
| `rng-core-v1` | Core RNG engine — request/finalize flow, VRF seed derivation, allowlists |
| `rng-operator-v1` | Operator contract — user-facing wrapper, result storage, switchable core |

All contracts target **Clarity 4** / **Epoch 3.3**.

## Architecture

```
Caller → rng-operator-v1 → rng-core-v1 → VRF seed → sha512/256 hash chain → uint
                ↑                  ↓
          stores result     callback: receive-randomness
```

**Modes:**
- `MODE-FAST` (u1) — uses VRF seed from the previous block, finalized in the same transaction
- `MODE-NEXT-TENURE` (u2) — uses VRF seed from a future tenure, finalized in a later transaction

**Security:**
- Operator and requester allowlists on core
- Core address validated via `data-var` + `contract-of` check on operator
- Owner-only admin functions with transferable ownership

## Contract Reference

### rng-traits-v1

Stable trait definitions shared by core and operator.

| Trait | Methods |
|---|---|
| `rng-operator-trait` | `(receive-randomness (uint uint) (response bool uint))` |
| `rng-core-trait` | `(request-randomness (<rng-operator-trait> uint) (response uint uint))`, `(finalize-randomness (uint <rng-operator-trait>) (response uint uint))` |

### rng-core-v1

Core RNG engine. Manages requests, derives randomness from VRF seeds via sha512/256 hash chain.

#### Read-only

| Function | Args | Returns | Description |
|---|---|---|---|
| `get-owner` | — | `(ok principal)` | Current contract owner |
| `get-requests-enabled` | — | `(ok bool)` | Whether new requests are accepted |
| `get-last-request-id` | — | `(ok uint)` | Last assigned request ID |
| `get-requester-allowed` | `principal` | `(ok bool)` | Check if requester is allowlisted |
| `get-operator-allowed` | `principal` | `(ok bool)` | Check if operator is allowlisted |
| `get-request` | `uint` | `(ok {...})` / `(err u404)` | Full request record |
| `get-randomness` | `uint` | `(ok uint)` / `(err u404/u409)` | Finalized randomness value |
| `get-randomness-in-range` | `uint, uint` | `(ok uint)` / `(err u404/u409/u411)` | `randomness mod max` |

#### Admin (owner-only)

| Function | Args | Returns | Description |
|---|---|---|---|
| `transfer-ownership` | `principal` | `(ok true)` | Transfer owner role |
| `flip-requests-enabled` | — | `(ok bool)` | Toggle request acceptance |
| `set-requester-allowed` | `principal, bool` | `(ok true)` | Add/remove requester from allowlist |
| `set-operator-allowed` | `principal, bool` | `(ok true)` | Add/remove operator from allowlist |

#### Public flow

| Function | Args | Returns | Description |
|---|---|---|---|
| `request-randomness` | `<rng-operator-trait>, uint` | `(ok uint)` | Create a new RNG request. Called by operator. |
| `finalize-randomness` | `uint, <rng-operator-trait>` | `(ok uint)` | Derive randomness and callback to operator. |

#### Errors

| Code | Constant | Description |
|---|---|---|
| `u401` | `ERR-NOT-AUTHORIZED` | Caller is not the contract owner |
| `u402` | `ERR-INVALID-OPERATOR` | Operator not allowlisted or tx-sender mismatch |
| `u403` | `ERR-REQUESTER-NOT-ALLOWED` | Requester not on allowlist |
| `u404` | `ERR-REQUEST-NOT-FOUND` | Request ID does not exist |
| `u405` | `ERR-ALREADY-FINALIZED` | Request already finalized |
| `u406` | `ERR-REQUESTS-DISABLED` | Request creation is paused |
| `u407` | `ERR-CALLBACK-FAILED` | Operator `receive-randomness` callback failed |
| `u408` | `ERR-NO-VRF-SEED` | VRF seed not available for target height |
| `u409` | `ERR-INVALID-STATE` | Randomness not yet available |
| `u410` | `ERR-TOO-EARLY` | Block height not yet reached for NEXT-TENURE mode |
| `u411` | `ERR-ZERO-MAX` | max=0 passed to range function |
| `u412` | `ERR-INVALID-MODE` | Mode is not FAST or NEXT-TENURE |

### rng-operator-v1

User-facing operator. Wraps core calls, stores results, validates core address via `data-var`.

#### Read-only

| Function | Args | Returns | Description |
|---|---|---|---|
| `get-owner` | — | `(ok principal)` | Current contract owner |
| `get-last-request-id` | — | `(ok uint)` | Last request ID created through operator |
| `get-last-random` | — | `(ok uint)` | Last received randomness value |
| `get-rng-core` | — | `(ok principal)` | Current core contract address |
| `get-result` | `uint` | `(ok {...})` / `(err u404)` | Result record for a request |
| `get-result-in-range` | `uint, uint` | `(ok uint)` / `(err u404/u406/u407)` | `randomness mod max` |

#### Admin (owner-only)

| Function | Args | Returns | Description |
|---|---|---|---|
| `transfer-ownership` | `principal` | `(ok true)` | Transfer owner role |
| `set-rng-core` | `principal` | `(ok true)` | Switch core contract address |

#### User flow

| Function | Args | Returns | Description |
|---|---|---|---|
| `request-rng` | `<rng-core-trait>, <rng-operator-trait>, uint` | `(ok uint)` | Request randomness with specified mode |
| `request-rng-now` | `<rng-core-trait>, <rng-operator-trait>` | `(ok uint)` | Request + finalize in one call (FAST mode) |
| `request-rng-next-tenure` | `<rng-core-trait>, <rng-operator-trait>` | `(ok uint)` | Request with NEXT-TENURE mode |
| `finalize-request` | `uint, <rng-core-trait>, <rng-operator-trait>` | `(ok uint)` | Finalize a pending request |
| `receive-randomness` | `uint, uint` | `(ok true)` | Callback from core (stores result) |

#### Errors

| Code | Constant | Description |
|---|---|---|
| `u501` | `ERR-NOT-AUTHORIZED` | Caller is not the contract owner |
| `u404` | `ERR-REQUEST-NOT-FOUND` | Request ID does not exist in results map |
| `u405` | `ERR-ALREADY-RESOLVED` | Request already has randomness stored |
| `u406` | `ERR-INVALID-STATE` | Randomness not yet resolved |
| `u407` | `ERR-ZERO-MAX` | max=0 passed to range function |
| `u408` | `ERR-INVALID-MODE` | Mode is not FAST or NEXT-TENURE |
| `u410` | `ERR-INVALID-CORE` | Passed core contract doesn't match `rng-core` data-var |

## Tests

47 tests across 2 test files. Run with `npm test`.

### rng-core-v1.test.ts (25 tests)

| Suite | Tests |
|---|---|
| **initial state** | deployer is owner, requests enabled, last-request-id=0, operators/requesters not allowed |
| **read-only guards** | get-request err for unknown id, get-randomness err for unknown id, get-randomness-in-range rejects max=0, get-randomness-in-range err for unknown id |
| **allowlists** | owner allow/revoke operator, non-owner cannot set operator, owner allow/revoke requester, non-owner cannot set requester, allow contract principal as operator |
| **requests toggle** | owner disable/re-enable, non-owner cannot flip |
| **request-randomness guards** | rejects when disabled, rejects invalid mode u0, rejects invalid mode u99, rejects when tx-sender ≠ operator |
| **finalize-randomness guards** | rejects non-existent request |
| **ownership transfer** | non-owner cannot transfer, owner transfers, old owner locked out, new owner can admin |

### rng-operator-v1.test.ts (22 tests)

| Suite | Tests |
|---|---|
| **initial state** | deployer is owner, last-request-id=0, last-random=0, rng-core points to .rng-core-v1 |
| **read-only guards** | get-result err for unknown id, get-result-in-range rejects max=0, get-result-in-range err for unknown id |
| **set-rng-core** | owner can change, non-owner cannot change |
| **receive-randomness** | rejects non-existent request |
| **request flow** | request-rng rejects wrong core, rejects invalid mode, propagates core tx-sender error; request-rng-now rejects wrong core, propagates core error; request-rng-next-tenure rejects wrong core; finalize-request rejects wrong core, propagates core not-found |
| **ownership transfer** | non-owner cannot transfer, owner transfers, old owner locked out, new owner can admin |

## Prerequisites

- [Clarinet](https://github.com/hirosystems/clarinet) v2+
- Node.js 18+

## Setup

```bash
npm install
```

## Usage

### Check contracts

```bash
clarinet check
```

### Run tests

```bash
npm test
```

### Run tests with coverage

```bash
npm run test:coverage
```

### Interactive console

```bash
clarinet console
```

## Project Structure

```
contracts/
  rng-traits-v1.clar      # Trait definitions
  rng-core-v1.clar         # Core RNG engine
  rng-operator-v1.clar     # Operator wrapper
tests/
  rng-core-v1.test.ts      # Core contract tests (25)
  rng-operator-v1.test.ts   # Operator contract tests (22)
settings/
  Devnet.toml              # Devnet accounts
.github/workflows/
  ci.yml                   # GitHub Actions CI
```

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).