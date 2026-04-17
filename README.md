# Decentralized Freelance Escrow — Solidity

A production-pattern smart contract for trustless freelance payments on Ethereum.

## Features
- Deadline-based payment release
- 5% penalty on client delay (cancelByFreelancer)
- Dispute resolution with neutral arbiter
- Auto-resolve if arbiter times out
- Pull-payment fallback for failed transfers
- 2-of-2 deadline extension approval

## Tech Stack
Solidity ^0.8.18 | Foundry | Sepolia Testnet

## Security Patterns Applied
- Checks-Effects-Interactions (CEI)
- Reentrancy protection
- Pull-payment fallback (FIX F)## Foundry

**Foundry is a blazing fast, portable and modular toolkit for Ethereum application development written in Rust.**

Foundry consists of:

- **Forge**: Ethereum testing framework (like Truffle, Hardhat and DappTools).
- **Cast**: Swiss army knife for interacting with EVM smart contracts, sending transactions and getting chain data.
- **Anvil**: Local Ethereum node, akin to Ganache, Hardhat Network.
- **Chisel**: Fast, utilitarian, and verbose solidity REPL.

## Documentation

https://book.getfoundry.sh/

## Usage

### Build

```shell
$ forge build
```

### Test

```shell
$ forge test
```

### Format

```shell
$ forge fmt
```

### Gas Snapshots

```shell
$ forge snapshot
```

### Anvil

```shell
$ anvil
```

### Deploy

```shell
$ forge script script/Counter.s.sol:CounterScript --rpc-url <your_rpc_url> --private-key <your_private_key>
```

### Cast

```shell
$ cast <subcommand>
```

### Help

```shell
$ forge --help
$ anvil --help
$ cast --help
```
