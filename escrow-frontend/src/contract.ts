export const CONTRACT_ADDRESS = "0x8f9f105e570AF8B56c3766831982605aD718685d";

export const ABI = [
  // You can copy the full ABI from your deployment output.
  // I'm including the essential functions below.
  // For a complete ABI, use the one from your forge artifact.
  {
    "type": "function",
    "name": "createEscrow",
    "inputs": [
      { "name": "freelancer", "type": "address", "internalType": "address" },
      { "name": "arbiter", "type": "address", "internalType": "address" },
      { "name": "deadlineDays", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "release",
    "inputs": [{ "name": "escrowId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "cancel",
    "inputs": [{ "name": "escrowId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "cancelByFreelancer",
    "inputs": [{ "name": "escrowId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "raiseDispute",
    "inputs": [{ "name": "escrowId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "resolveDispute",
    "inputs": [
      { "name": "escrowId", "type": "uint256", "internalType": "uint256" },
      { "name": "favorFreelancer", "type": "bool", "internalType": "bool" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "autoResolveDispute",
    "inputs": [{ "name": "escrowId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "withdraw",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getEscrow",
    "inputs": [{ "name": "escrowId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "components": [
          { "name": "client", "type": "address" },
          { "name": "freelancer", "type": "address" },
          { "name": "arbiter", "type": "address" },
          { "name": "amount", "type": "uint256" },
          { "name": "deadline", "type": "uint256" },
          { "name": "disputeDeadline", "type": "uint256" },
          { "name": "status", "type": "uint8" },
          { "name": "disputeRaisedBy", "type": "address" }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nextEscrowId",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "EscrowCreated",
    "inputs": [
      { "name": "id", "type": "uint256", "indexed": true },
      { "name": "client", "type": "address", "indexed": true },
      { "name": "freelancer", "type": "address", "indexed": true },
      { "name": "amount", "type": "uint256", "indexed": false },
      { "name": "deadline", "type": "uint256", "indexed": false }
    ]
  },
  // Add other events if needed
] as const;

// Status enum mapping
export const StatusEnum = {
  0: "Active",
  1: "Released",
  2: "Cancelled",
  3: "Disputed"
};