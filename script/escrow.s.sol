// SPDX-License-Identifier: MIT
pragma solidity >=0.8.18 <0.9.0;
import {Script} from "forge-std/Script.sol";
import {Escrow} from "../src/escrow.sol";

contract CounterScript is Script {
    Escrow public counter;

    function setUp() public {}

    function run() public {
        vm.startBroadcast();

        counter = new Escrow();

        vm.stopBroadcast();
    }
}
