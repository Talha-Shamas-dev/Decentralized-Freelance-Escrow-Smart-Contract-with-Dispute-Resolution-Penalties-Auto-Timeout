# Decentralized Freelance Escrow

[![Solidity](https://img.shields.io/badge/Solidity-^0.8.18-blue)](https://soliditylang.org/)
[![Foundry](https://img.shields.io/badge/Built%20with-Foundry-orange)](https://getfoundry.sh/)
[![zkSync Era](https://img.shields.io/badge/zkSync%20Era-Sepolia-blueviolet)](https://era.zksync.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

**An advanced, production‑ready smart contract for trustless freelance payments on zkSync Era.**  
Designed for cross‑border freelancing, this escrow system includes deadline enforcement, penalty fees, dispute resolution with arbiter, auto‑timeout, deadline extensions, and a pull‑payment fallback.

---

## ✨ Features

- ✅ **Secure Escrow** – Funds are locked until release or dispute resolution.
- ⏰ **Deadline & Grace Period** – Freelancer can cancel after `deadline + 1 day` and receives a 5% penalty from the locked amount.
- ⚖️ **Dispute Resolution** – Any party can raise a dispute within a 3‑day window after the deadline. A neutral arbiter resolves in favour of client or freelancer.
- ⏱️ **Arbiter Timeout** – If the arbiter does not act within 7 days, the dispute auto‑resolves against the party who raised it (discourages frivolous disputes).
- 📅 **Deadline Extension** – Both client and freelancer must approve any extension (2‑of‑2 signature pattern).
- 💸 **Pull‑Payment Fallback** – If a direct ETH transfer fails (e.g., recipient contract rejects payment), funds are queued for manual withdrawal.
- 🧪 **Fully Tested** – 30+ unit tests and fuzz tests using Foundry. All critical paths covered.
- 🔐 **Security First** – Follows Checks‑Effects‑Interactions pattern, reentrancy‑safe, no risky assembly or delegatecall.

---

## 🛠️ Tech Stack

- **Smart Contract** – Solidity `^0.8.18`
- **Framework** – Foundry (forge, cast, anvil)
- **zkSync Era** – Native compilation (`--zksync`) and deployment
- **Testing** – Forge standard library + fuzzing
- **Verification** – zkSync block explorer (auto‑verify during deployment)

---

## 📦 Contract Address (zkSync Era Sepolia)

> **Deployed & Verified**  
> [`0x8f9f105e570AF8B56c3766831982605aD718685d`](https://sepolia.explorer.zksync.io/address/0x8f9f105e570AF8B56c3766831982605aD718685d)

Use the link above to inspect the source code, read/write functions, and transaction history.

---

## 🚀 Getting Started

### Prerequisites

- [Foundry](https://getfoundry.sh/) (for standard EVM) **or** [Foundry‑ZKsync](https://github.com/matter-labs/foundry-zksync) (for zkSync deployment)
- Node.js (optional, for frontend integration)

### Clone the Repository

```bash
git clone https://github.com/Talha-Shamas-dev/Decentralized-Freelance-Escrow-Smart-Contract-with-Dispute-Resolution-Penalties-Auto-Timeout.git
cd Decentralized-Freelance-Escrow-...
