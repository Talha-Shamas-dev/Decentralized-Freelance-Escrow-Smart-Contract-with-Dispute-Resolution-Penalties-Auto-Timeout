// SPDX-License-Identifier: MIT
pragma solidity >=0.8.18 <0.9.0;

/**
 * @title  Escrow — Elite Portfolio Version
 * @notice Freelance escrow with deadline, penalty, dispute, arbiter timeout,
 *         auto-resolution, deadline extension, and pull-payment fallback.
 * @dev    All 6 audit fixes applied. NOT production-ready without formal audit.
 *
 * ── FIX LIST ──────────────────────────────────────────────────────────────
 * FIX A  cancelByFreelancer — 5% penalty to freelancer, rest refunded
 * FIX B  Events emit amount for off-chain tracking
 * FIX C  extendDeadline — both parties must approve (2-of-2 signature pattern)
 * FIX D  Grace period — cancelByFreelancer blocked 1 day after deadline
 * FIX E  autoResolveDispute — checks WHO raised dispute, resolves accordingly
 * FIX F  Pull-payment fallback — if direct transfer fails, winner can withdraw
 * ──────────────────────────────────────────────────────────────────────────
 */
contract Escrow {

    // ═══════════════════════════════════════════════════════
    //  ENUMS & STRUCTS
    // ═══════════════════════════════════════════════════════

    enum Status {
        Active,
        Released,
        Cancelled,
        Disputed
    }

    struct EscrowData {
        address client;
        address freelancer;
        address arbiter;
        uint256 amount;
        uint256 deadline;
        uint256 disputeDeadline;
        Status  status;
        address disputeRaisedBy;    // FIX E: track who raised dispute
    }

    // ═══════════════════════════════════════════════════════
    //  STATE VARIABLES
    // ═══════════════════════════════════════════════════════

    mapping(uint256 => EscrowData) public escrows;
    uint256 public nextEscrowId;

    // FIX C: deadline extension approvals — escrowId => party => approved
    mapping(uint256 => mapping(address => bool)) public extensionApprovals;
    mapping(uint256 => uint256) public proposedExtraDays;

    // FIX F: pull-payment fallback — recipient => amount owed
    mapping(address => uint256) public pendingWithdrawals;

    // ── Constants ──
    uint256 public constant MAX_DEADLINE_DAYS    = 365;
    uint256 public constant DISPUTE_WINDOW_DAYS  = 3;
    uint256 public constant ARBITER_TIMEOUT_DAYS = 7;
    uint256 public constant GRACE_PERIOD_DAYS    = 1;   // FIX D
    uint256 public constant PENALTY_BPS          = 500; // FIX A: 5% = 500 basis points

    // ═══════════════════════════════════════════════════════
    //  EVENTS  — FIX B: all events include amount
    // ═══════════════════════════════════════════════════════

    event EscrowCreated(
        uint256 indexed id,
        address indexed client,
        address indexed freelancer,
        uint256 amount,
        uint256 deadline
    );
    event Released(
        uint256 indexed id,
        address indexed freelancer,
        uint256 amount          // FIX B
    );
    event Cancelled(
        uint256 indexed id,
        address indexed client,
        uint256 amount          // FIX B
    );
    event CancelledByFreelancer(
        uint256 indexed id,
        address indexed freelancer,
        uint256 penalty,        // FIX B
        uint256 refund          // FIX B
    );
    event DisputeRaised(
        uint256 indexed id,
        address indexed raisedBy
    );
    event DisputeResolved(
        uint256 indexed id,
        address indexed winner,
        bool    favoredFreelancer,
        uint256 amount          // FIX B
    );
    event DisputeAutoResolved(
        uint256 indexed id,
        address indexed winner,
        uint256 amount          // FIX B
    );
    event DeadlineExtensionProposed(
        uint256 indexed id,
        address indexed proposedBy,
        uint256 extraDays
    );
    event DeadlineExtended(
        uint256 indexed id,
        uint256 newDeadline
    );
    event WithdrawalQueued(                         // FIX F
        uint256 indexed id,
        address indexed recipient,
        uint256 amount
    );

    // ═══════════════════════════════════════════════════════
    //  MODIFIERS
    // ═══════════════════════════════════════════════════════

    modifier escrowExists(uint256 id) {
        require(escrows[id].client != address(0), "Escrow not found");
        _;
    }

    modifier onlyActive(uint256 id) {
        require(escrows[id].status == Status.Active, "Not active");
        _;
    }

    modifier onlyDisputed(uint256 id) {
        require(escrows[id].status == Status.Disputed, "Not disputed");
        _;
    }

    modifier onlyParty(uint256 id) {
        require(
            msg.sender == escrows[id].client ||
            msg.sender == escrows[id].freelancer,
            "Not a party"
        );
        _;
    }

    // ═══════════════════════════════════════════════════════
    //  CORE FUNCTIONS
    // ═══════════════════════════════════════════════════════

    /**
     * @notice Naya escrow banao
     * @param freelancer  Kaam karne wala
     * @param arbiter     Neutral third party
     * @param deadlineDays Deadline in days
     */
    function createEscrow(
        address freelancer,
        address arbiter,
        uint256 deadlineDays
    ) external payable {

        // ── CHECKS ──
        require(msg.value > 0,                           "Amount must be > 0");
        require(freelancer != address(0),                "Invalid freelancer");
        require(arbiter    != address(0),                "Invalid arbiter");
        require(freelancer != msg.sender,                "Client = freelancer");
        require(arbiter    != msg.sender,                "Arbiter = client");
        require(arbiter    != freelancer,                "Arbiter = freelancer");
        require(
            deadlineDays > 0 && deadlineDays <= MAX_DEADLINE_DAYS,
            "Invalid deadline"
        );

        // ── EFFECTS ──
        uint256 id = nextEscrowId;
        nextEscrowId++;

        escrows[id] = EscrowData({
            client          : msg.sender,
            freelancer      : freelancer,
            arbiter         : arbiter,
            amount          : msg.value,
            deadline        : block.timestamp + (deadlineDays * 1 days),
            disputeDeadline : 0,
            status          : Status.Active,
            disputeRaisedBy : address(0)
        });

        emit EscrowCreated(id, msg.sender, freelancer, msg.value, escrows[id].deadline);
    }

    /**
     * @notice Client payment release kare — sirf deadline se pehle
     */
    function release(uint256 escrowId)
        external
        escrowExists(escrowId)
        onlyActive(escrowId)
    {
        EscrowData storage escrow = escrows[escrowId];

        // ── CHECKS ──
        require(msg.sender == escrow.client,             "Not client");
        require(block.timestamp <= escrow.deadline,      "Deadline passed");

        // ── EFFECTS ──
        escrow.status  = Status.Released;
        uint256 amount = escrow.amount;
        escrow.amount  = 0;

        // ── INTERACTIONS ──
        _safeTransfer(escrowId, escrow.freelancer, amount);

        emit Released(escrowId, escrow.freelancer, amount);
    }

    /**
     * @notice Client escrow cancel kare
     */
    function cancel(uint256 escrowId)
        external
        escrowExists(escrowId)
        onlyActive(escrowId)
    {
        EscrowData storage escrow = escrows[escrowId];

        // ── CHECKS ──
        require(msg.sender == escrow.client,             "Not client");

        // ── EFFECTS ──
        escrow.status  = Status.Cancelled;
        uint256 amount = escrow.amount;
        escrow.amount  = 0;

        // ── INTERACTIONS ──
        _safeTransfer(escrowId, escrow.client, amount);

        emit Cancelled(escrowId, escrow.client, amount);
    }

    /**
     * @notice Freelancer deadline + grace period ke baad cancel kare
     * @dev    FIX A: 5% penalty freelancer ko, baki client ko
     *         FIX D: 1 din grace period — client ko release karne ka mauka
     */
    function cancelByFreelancer(uint256 escrowId)
        external
        escrowExists(escrowId)
        onlyActive(escrowId)
    {
        EscrowData storage escrow = escrows[escrowId];

        // ── CHECKS ──
        require(msg.sender == escrow.freelancer,         "Not freelancer");
        // FIX D: grace period — deadline + 1 day ke baad cancel ho sakta hai
        require(
            block.timestamp > escrow.deadline + (GRACE_PERIOD_DAYS * 1 days),
            "Grace period active - client can still pay"   // FIXED: em dash replaced with hyphen
        );

        // ── EFFECTS ──
        // FIX A: 5% penalty calculation
        uint256 penalty = (escrow.amount * PENALTY_BPS) / 10_000;
        uint256 refund  = escrow.amount - penalty;

        escrow.status = Status.Cancelled;
        escrow.amount = 0;

        // ── INTERACTIONS ──
        _safeTransfer(escrowId, escrow.freelancer, penalty);
        _safeTransfer(escrowId, escrow.client,     refund);

        emit CancelledByFreelancer(escrowId, escrow.freelancer, penalty, refund);
    }

    // ═══════════════════════════════════════════════════════
    //  DEADLINE EXTENSION  — FIX C
    // ═══════════════════════════════════════════════════════

    /**
     * @notice Deadline extension propose karo — dono parties approve karein
     * @dev    2-of-2: client aur freelancer dono approve karein tabhi extend ho
     * @param  extraDays Kitne aur din chahiye
     */
    function proposeDeadlineExtension(uint256 escrowId, uint256 extraDays)
        external
        escrowExists(escrowId)
        onlyActive(escrowId)
        onlyParty(escrowId)
    {
        require(extraDays > 0 && extraDays <= 180,       "Invalid extension");

        EscrowData storage escrow = escrows[escrowId];

        // Agar naya proposal hai toh purani approvals reset karo
        if (proposedExtraDays[escrowId] != extraDays) {
            extensionApprovals[escrowId][escrow.client]     = false;
            extensionApprovals[escrowId][escrow.freelancer] = false;
            proposedExtraDays[escrowId] = extraDays;
        }

        // Apni approval do
        extensionApprovals[escrowId][msg.sender] = true;

        emit DeadlineExtensionProposed(escrowId, msg.sender, extraDays);

        // Check: kya dono approve kar chuke hain?
        if (
            extensionApprovals[escrowId][escrow.client] &&
            extensionApprovals[escrowId][escrow.freelancer]
        ) {
            escrow.deadline += extraDays * 1 days;

            // Reset approvals
            extensionApprovals[escrowId][escrow.client]     = false;
            extensionApprovals[escrowId][escrow.freelancer] = false;
            proposedExtraDays[escrowId] = 0;

            emit DeadlineExtended(escrowId, escrow.deadline);
        }
    }

    // ═══════════════════════════════════════════════════════
    //  DISPUTE FUNCTIONS
    // ═══════════════════════════════════════════════════════

    /**
     * @notice Dispute raise karo
     */
    function raiseDispute(uint256 escrowId)
        external
        escrowExists(escrowId)
        onlyActive(escrowId)
        onlyParty(escrowId)
    {
        EscrowData storage escrow = escrows[escrowId];

        // ── CHECKS ──
        require(
            block.timestamp <= escrow.deadline + (DISPUTE_WINDOW_DAYS * 1 days),
            "Dispute window expired"
        );

        // ── EFFECTS ──
        escrow.status          = Status.Disputed;
        escrow.disputeDeadline = block.timestamp + (ARBITER_TIMEOUT_DAYS * 1 days);
        escrow.disputeRaisedBy = msg.sender;     // FIX E: track karo

        emit DisputeRaised(escrowId, msg.sender);
    }

    /**
     * @notice Arbiter dispute resolve kare
     */
    function resolveDispute(uint256 escrowId, bool favorFreelancer)
        external
        escrowExists(escrowId)
        onlyDisputed(escrowId)
    {
        EscrowData storage escrow = escrows[escrowId];

        // ── CHECKS ──
        require(msg.sender == escrow.arbiter,                "Not arbiter");
        require(block.timestamp <= escrow.disputeDeadline,   "Arbiter timeout");

        // ── EFFECTS ──
        escrow.status = favorFreelancer ? Status.Released : Status.Cancelled;
        uint256 amount = escrow.amount;
        escrow.amount  = 0;
        address winner = favorFreelancer ? escrow.freelancer : escrow.client;

        // ── INTERACTIONS ──
        _safeTransfer(escrowId, winner, amount);

        emit DisputeResolved(escrowId, winner, favorFreelancer, amount);
    }

    /**
     * @notice Arbiter timeout par auto-resolve
     * @dev    FIX E: Jo party ne dispute raise kiya uske KHILAF resolve hoga
     *         — frivolous disputes discourage karne ke liye
     *
     *         Logic:
     *         - Client ne raise kiya → freelancer default winner (client ne kaam rok diya)
     *         - Freelancer ne raise kiya → client default winner (freelancer ne kaam nahi kiya)
     */
    function autoResolveDispute(uint256 escrowId)
        external
        escrowExists(escrowId)
        onlyDisputed(escrowId)
    {
        EscrowData storage escrow = escrows[escrowId];

        // ── CHECKS ──
        require(block.timestamp > escrow.disputeDeadline,   "Arbiter still has time");

        // ── EFFECTS ──
        // FIX E: jo raise kiya uske khilaf — gaming prevent karta hai
        bool freelancerWins = (escrow.disputeRaisedBy == escrow.client);

        escrow.status = freelancerWins ? Status.Released : Status.Cancelled;
        uint256 amount = escrow.amount;
        escrow.amount  = 0;
        address winner = freelancerWins ? escrow.freelancer : escrow.client;

        // ── INTERACTIONS ──
        _safeTransfer(escrowId, winner, amount);

        emit DisputeAutoResolved(escrowId, winner, amount);
    }

    // ═══════════════════════════════════════════════════════
    //  PULL PAYMENT — FIX F
    // ═══════════════════════════════════════════════════════

    /**
     * @notice Agar direct transfer fail ho toh winner yahan se withdraw kare
     * @dev    Push transfer fail hone par funds yahan queue ho jate hain
     */
    function withdraw() external {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0,                              "Nothing to withdraw");

        // ── EFFECTS ──
        pendingWithdrawals[msg.sender] = 0;

        // ── INTERACTIONS ──
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success,                                 "Withdrawal failed");
    }

    // ═══════════════════════════════════════════════════════
    //  INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════

    /**
     * @dev FIX F: Safe transfer — push fail ho toh pull mein queue karo
     */
    function _safeTransfer(
        uint256 escrowId,
        address recipient,
        uint256 amount
    ) internal {
        (bool success, ) = payable(recipient).call{value: amount}("");
        if (!success) {
            // Direct transfer fail — pull-payment mein queue karo
            pendingWithdrawals[recipient] += amount;
            emit WithdrawalQueued(escrowId, recipient, amount);
        }
    }

    // ═══════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════

    function getEscrow(uint256 escrowId)
        external
        view
        escrowExists(escrowId)
        returns (EscrowData memory)
    {
        return escrows[escrowId];
    }

    function isDeadlinePassed(uint256 escrowId)
        external
        view
        escrowExists(escrowId)
        returns (bool)
    {
        return block.timestamp > escrows[escrowId].deadline;
    }

    function isArbiterTimedOut(uint256 escrowId)
        external
        view
        escrowExists(escrowId)
        returns (bool)
    {
        EscrowData storage escrow = escrows[escrowId];
        return (
            escrow.status == Status.Disputed &&
            block.timestamp > escrow.disputeDeadline
        );
    }
}