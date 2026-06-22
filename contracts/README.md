# PanikEscrow — Smart Contract

Founding-user escrow for PANIK. Accepts **exactly 5 USDC** per wallet on **Base**. If PANIK ships, the team releases funds to the treasury. If 90 days pass without release, the depositor can claim a full refund.

## Trust Properties

- **Per-depositor refund window** — each wallet's 90-day clock starts at their own deposit timestamp.
- **Refunds claimable forever** — no sweep, no expiry.
- **Forfeiture on deadline** — if the team doesn't release before 90 days, those funds belong to the depositor permanently.
- **No selfdestruct, no admin withdrawal, no upgrade proxy.**

## Prerequisites

Install [Foundry](https://getfoundry.sh):

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

## Build

```bash
cd contracts
forge build
```

## Test

```bash
forge test -vvv
```

## Deploy

### Base Sepolia (testnet)

```bash
export PRIVATE_KEY=<your-deployer-private-key>
export OWNER_ADDRESS=<team-eoa-or-multisig>
export TREASURY_ADDRESS=<treasury-wallet>

forge script script/Deploy.s.sol:DeployPanikEscrow \
  --rpc-url base_sepolia \
  --broadcast \
  -vvvv
```

### Base Mainnet

```bash
forge script script/Deploy.s.sol:DeployPanikEscrow \
  --rpc-url base \
  --broadcast \
  --verify \
  -vvvv
```

## Contract Interface

| Function | Access | Description |
|----------|--------|-------------|
| `deposit()` | Anyone | Deposit exactly 5 USDC (must approve first) |
| `release(address)` | Owner | Release a depositor's funds to treasury (before 90d) |
| `claimRefund()` | Depositor | Claim refund after 90 days without release |
| `hasPaid(address)` | View | Check if a wallet has deposited |
| `isRefundable(address)` | View | Check if a refund is currently claimable |
| `refundDeadline(address)` | View | Get the refund eligibility timestamp |
| `getDepositInfo(address)` | View | Get full deposit status |
| `transferOwnership(address)` | Owner | Transfer contract ownership |
| `setTreasury(address)` | Owner | Update treasury address |

## Addresses

| Chain | USDC |
|-------|------|
| Base Mainnet (8453) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Base Sepolia (84532) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
