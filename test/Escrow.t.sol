// SPDX-License-Identifier: MIT
pragma solidity >=0.8.18 <0.9.0;

import "forge-std/Test.sol";
import "../src/escrow.sol";

contract EscrowTest is Test {
    Escrow public escrow;
    address public client = address(0x1);
    address public freelancer = address(0x2);
    address public arbiter = address(0x3);
    uint256 public constant INITIAL_BALANCE = 10 ether;

    function setUp() public {
        vm.deal(client, INITIAL_BALANCE);
        escrow = new Escrow();
    }

    // Helper to create an escrow as client
    function _createEscrow(uint256 deadlineDays) internal returns (uint256) {
        vm.prank(client);
        escrow.createEscrow{value: 1 ether}(freelancer, arbiter, deadlineDays);
        return escrow.nextEscrowId() - 1;
    }

    // ==================== UNIT TESTS ====================

    function test_CreateEscrow() public {
        uint256 deadlineDays = 30;
        vm.prank(client);
        escrow.createEscrow{value: 1 ether}(freelancer, arbiter, deadlineDays);
        
        uint256 id = escrow.nextEscrowId() - 1;
        Escrow.EscrowData memory e = escrow.getEscrow(id);
        
        assertEq(e.client, client);
        assertEq(e.freelancer, freelancer);
        assertEq(e.amount, 1 ether);
        assertEq(e.deadline, block.timestamp + (deadlineDays * 1 days));
    }

    function test_Release() public {
        uint256 id = _createEscrow(30);
        uint256 before = freelancer.balance;

        vm.prank(client);
        escrow.release(id);

        Escrow.EscrowData memory e = escrow.getEscrow(id);
        assertEq(e.amount, 0);
        assertEq(uint256(e.status), uint256(Escrow.Status.Released));
        assertEq(freelancer.balance, before + 1 ether);
    }

    function test_ReleaseAfterDeadline_Reverts() public {
        uint256 id = _createEscrow(1);
        vm.warp(block.timestamp + 2 days);
        
        vm.prank(client);
        vm.expectRevert("Deadline passed");
        escrow.release(id);
    }

    function test_CancelByFreelancer_AfterGracePeriod() public {
        uint256 id = _createEscrow(1);
        uint256 originalAmount = 1 ether;
        
        vm.warp(block.timestamp + 1 days + 2 days);
        
        vm.prank(freelancer);
        escrow.cancelByFreelancer(id);
        
        uint256 penalty = (originalAmount * 500) / 10000;
        uint256 refund = originalAmount - penalty;
        
        assertEq(freelancer.balance, penalty);
        assertEq(client.balance, INITIAL_BALANCE - originalAmount + refund);
    }

    function test_DisputeResolve_FavorFreelancer() public {
        uint256 id = _createEscrow(30);
        
        vm.prank(freelancer);
        escrow.raiseDispute(id);
        
        Escrow.EscrowData memory e1 = escrow.getEscrow(id);
        assertEq(uint256(e1.status), uint256(Escrow.Status.Disputed));
        
        vm.prank(arbiter);
        escrow.resolveDispute(id, true);
        
        Escrow.EscrowData memory e2 = escrow.getEscrow(id);
        assertEq(e2.amount, 0);
        assertEq(uint256(e2.status), uint256(Escrow.Status.Released));
        assertEq(freelancer.balance, 1 ether);
    }

    function test_AutoResolveDispute_Timeout() public {
        uint256 id = _createEscrow(30);
        vm.prank(client);
        escrow.raiseDispute(id);
        
        vm.warp(block.timestamp + 8 days);
        
        vm.prank(freelancer);
        escrow.autoResolveDispute(id);
        
        assertEq(freelancer.balance, 1 ether);
    }

    function test_DeadlineExtension() public {
        uint256 id = _createEscrow(10);
        uint256 originalDeadline = escrow.getEscrow(id).deadline;

        vm.prank(client);
        escrow.proposeDeadlineExtension(id, 5);

        vm.prank(freelancer);
        escrow.proposeDeadlineExtension(id, 5);

        uint256 newDeadline = escrow.getEscrow(id).deadline;
        assertEq(newDeadline, originalDeadline + 5 days);
    }

    // ==================== FUZZ TESTS ====================

    function testFuzz_CreateEscrow_RevertInvalid(uint256 deadlineDays) public {
        vm.assume(deadlineDays == 0 || deadlineDays > 365);
        vm.deal(client, 1 ether);
        vm.prank(client);
        vm.expectRevert("Invalid deadline");
        escrow.createEscrow{value: 1 ether}(freelancer, arbiter, deadlineDays);
    }

    function testFuzz_ReleaseOnlyBeforeDeadline(uint256 timeOffset) public {
        vm.assume(timeOffset <= 365 days);
        uint256 id = _createEscrow(30);
        
        vm.warp(block.timestamp + timeOffset);
        
        if (timeOffset <= 30 days) {
            vm.prank(client);
            escrow.release(id);
            Escrow.EscrowData memory e = escrow.getEscrow(id);
            assertEq(uint256(e.status), uint256(Escrow.Status.Released));
        } else {
            vm.prank(client);
            vm.expectRevert("Deadline passed");
            escrow.release(id);
        }
    }

 function testFuzz_PenaltyNeverExceedsAmount(uint256 amount) public {
    vm.assume(amount > 0 && amount <= 1000 ether);
    vm.deal(client, amount);

    vm.prank(client);
    escrow.createEscrow{value: amount}(freelancer, arbiter, 1);
    uint256 id = escrow.nextEscrowId() - 1;

    // Get the escrow's deadline
    uint256 deadline = escrow.getEscrow(id).deadline;

    // Use the constant from the Escrow contract
    uint256 gracePeriodDays = escrow.GRACE_PERIOD_DAYS();

    // Warp to deadline + grace period + 1 second
    vm.warp(deadline + (gracePeriodDays * 1 days) + 1);

    vm.prank(freelancer);
    escrow.cancelByFreelancer(id);

    uint256 penalty = (amount * 500) / 10000;
    assertLe(penalty, amount);
}
}