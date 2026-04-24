// SPDX-License-Identifier: MIT
pragma solidity >=0.8.18 <0.9.0;

import {Script, console2} from "forge-std/Script.sol";
import {Escrow} from "../src/escrow.sol";

/**
 * @title  EscrowScript
 * @notice Deployment script for the Escrow contract.
 *
 * ── USAGE ──────────────────────────────────────────────────────────────────
 *
 *  Local Anvil:
 *    forge script script/Escrow.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
 *
 *  Sepolia testnet:
 *    forge script script/Escrow.s.sol \
 *      --rpc-url $SEPOLIA_RPC_URL    \
 *      --private-key $PRIVATE_KEY    \
 *      --broadcast                   \
 *      --verify                      \
 *      --etherscan-api-key $ETHERSCAN_API_KEY
 *
 *  Verify only (after deployment):
 *    forge verify-contract <DEPLOYED_ADDRESS> src/escrow.sol:Escrow \
 *      --chain sepolia \
 *      --etherscan-api-key $ETHERSCAN_API_KEY
 *
 * ── ENV VARS REQUIRED ──────────────────────────────────────────────────────
 *  PRIVATE_KEY          — deployer wallet private key (never commit)
 *  SEPOLIA_RPC_URL      — Alchemy / Infura / etc.
 *  ETHERSCAN_API_KEY    — for --verify flag
 * ──────────────────────────────────────────────────────────────────────────
 */
contract EscrowScript is Script {

    Escrow public escrow;

    function setUp() public {}

    function run() public returns (Escrow) {
        // Read deployer key from environment — never hardcode keys
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console2.log("=== Escrow Deployment ===");
        console2.log("Deployer     :", deployer);
        console2.log("Chain ID     :", block.chainid);
        console2.log("Block number :", block.number);

        vm.startBroadcast(deployerPrivateKey);

        escrow = new Escrow();

        vm.stopBroadcast();

        console2.log("Escrow deployed at :", address(escrow));
        console2.log("Max deadline days  :", escrow.MAX_DEADLINE_DAYS());
        console2.log("Penalty BPS        :", escrow.PENALTY_BPS());
        console2.log("Arbiter timeout    :", escrow.ARBITER_TIMEOUT_DAYS(), "days");

        return escrow;
    }
}
