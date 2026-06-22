/**
 * Compile and deploy PanikEscrow to Base Sepolia.
 *
 * Usage:
 *   node --env-file=.env scripts/deploy-escrow.mjs
 *
 * Required env vars:
 *   DEPLOYER_PRIVATE_KEY   — private key of the deployer wallet (with Base Sepolia ETH for gas)
 *   ESCROW_OWNER_ADDRESS   — owner of the contract (can call release)
 *   ESCROW_TREASURY_ADDRESS — where released funds go
 */

import solc from 'solc';
import fs from 'fs';
import path from 'path';
import { createWalletClient, createPublicClient, http, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

// ── Base Sepolia USDC (Circle-issued test USDC) ──────────────────────
const BASE_SEPOLIA_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

// ── Read env ─────────────────────────────────────────────────────────
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const OWNER = process.env.ESCROW_OWNER_ADDRESS;
const TREASURY = process.env.ESCROW_TREASURY_ADDRESS;

if (!PRIVATE_KEY) { console.error('❌ Set DEPLOYER_PRIVATE_KEY in .env'); process.exit(1); }
if (!OWNER) { console.error('❌ Set ESCROW_OWNER_ADDRESS in .env'); process.exit(1); }
if (!TREASURY) { console.error('❌ Set ESCROW_TREASURY_ADDRESS in .env'); process.exit(1); }

// ── Compile the contract ─────────────────────────────────────────────
console.log('🔨 Compiling PanikEscrow.sol...');

// We use a flattened source that doesn't depend on forge-std imports
const contractSource = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract PanikEscrow {
    IERC20 public immutable usdc;
    uint256 public constant DEPOSIT_AMOUNT = 5_000_000;
    uint256 public constant REFUND_WINDOW = 90 days;

    address public owner;
    address public treasury;
    uint256 public immutable refundDeadline;
    bool public shipped;

    mapping(address => uint256) public depositTime;
    mapping(address => bool) public refunded;
    uint256 public depositorCount;

    event Deposited(address indexed depositor, uint256 timestamp);
    event Shipped();
    event Refunded(address indexed depositor);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);

    error NotOwner();
    error AlreadyDeposited();
    error NotDeposited();
    error AlreadyShipped();
    error AlreadyRefunded();
    error RefundWindowNotPassed();
    error RefundWindowPassed();
    error ZeroAddress();
    error TransferFailed();

    constructor(address _usdc, address _owner, address _treasury) {
        if (_usdc == address(0) || _owner == address(0) || _treasury == address(0)) {
            revert ZeroAddress();
        }
        usdc = IERC20(_usdc);
        owner = _owner;
        treasury = _treasury;
        refundDeadline = block.timestamp + REFUND_WINDOW;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function deposit() external {
        if (shipped) revert AlreadyShipped();
        if (block.timestamp >= refundDeadline) revert RefundWindowPassed();
        if (depositTime[msg.sender] != 0) revert AlreadyDeposited();

        bool success = usdc.transferFrom(msg.sender, address(this), DEPOSIT_AMOUNT);
        if (!success) revert TransferFailed();

        depositTime[msg.sender] = block.timestamp;
        depositorCount++;

        emit Deposited(msg.sender, block.timestamp);
    }

    function ship() external onlyOwner {
        if (shipped) revert AlreadyShipped();
        if (block.timestamp >= refundDeadline) {
            revert RefundWindowPassed();
        }
        shipped = true;

        uint256 balance = usdc.balanceOf(address(this));
        if (balance > 0) {
            bool success = usdc.transfer(treasury, balance);
            if (!success) revert TransferFailed();
        }

        emit Shipped();
    }

    function claimRefund() external {
        if (shipped) revert AlreadyShipped();
        if (depositTime[msg.sender] == 0) revert NotDeposited();
        if (refunded[msg.sender]) revert AlreadyRefunded();

        if (block.timestamp < refundDeadline) {
            revert RefundWindowNotPassed();
        }

        refunded[msg.sender] = true;

        bool success = usdc.transfer(msg.sender, DEPOSIT_AMOUNT);
        if (!success) revert TransferFailed();

        emit Refunded(msg.sender);
    }

    function hasPaid(address wallet) external view returns (bool) {
        return depositTime[wallet] != 0;
    }

    function isRefundable(address wallet) external view returns (bool) {
        return depositTime[wallet] != 0
            && !shipped
            && !refunded[wallet]
            && block.timestamp >= refundDeadline;
    }

    function getDepositInfo(address wallet)
        external view returns (uint256 _depositTime, bool _shipped, bool _refunded)
    {
        return (depositTime[wallet], shipped, refunded[wallet]);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }
}
`;

const input = {
  language: 'Solidity',
  sources: { 'PanikEscrow.sol': { content: contractSource } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  const fatal = output.errors.filter(e => e.severity === 'error');
  if (fatal.length > 0) {
    console.error('❌ Compilation errors:');
    fatal.forEach(e => console.error(e.formattedMessage));
    process.exit(1);
  }
  // Warnings are OK
  output.errors.filter(e => e.severity === 'warning').forEach(e => {
    console.warn('⚠️', e.message);
  });
}

const contract = output.contracts['PanikEscrow.sol']['PanikEscrow'];
const abi = contract.abi;
const bytecode = '0x' + contract.evm.bytecode.object;

console.log('✅ Compiled successfully');
console.log(`   ABI entries: ${abi.length}`);
console.log(`   Bytecode: ${bytecode.length} chars`);

// Save ABI to a file for the frontend to use
const abiDir = path.resolve('contracts', 'out');
fs.mkdirSync(abiDir, { recursive: true });
fs.writeFileSync(path.join(abiDir, 'PanikEscrow.abi.json'), JSON.stringify(abi, null, 2));
console.log('   ABI saved to contracts/out/PanikEscrow.abi.json');

// ── Deploy ───────────────────────────────────────────────────────────
console.log('\n🚀 Deploying to Base Sepolia...');
console.log(`   Owner:    ${OWNER}`);
console.log(`   Treasury: ${TREASURY}`);
console.log(`   USDC:     ${BASE_SEPOLIA_USDC}`);

const account = privateKeyToAccount(PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`);
console.log(`   Deployer: ${account.address}`);

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(),
});

// Check deployer balance
const balance = await publicClient.getBalance({ address: account.address });
console.log(`   Balance:  ${(Number(balance) / 1e18).toFixed(6)} ETH`);

if (balance === 0n) {
  console.error('❌ Deployer has no ETH on Base Sepolia. Get some from a faucet:');
  console.error('   https://www.alchemy.com/faucets/base-sepolia');
  process.exit(1);
}

// Deploy
const hash = await walletClient.deployContract({
  abi,
  bytecode,
  args: [BASE_SEPOLIA_USDC, OWNER, TREASURY],
});

console.log(`\n⏳ Tx submitted: ${hash}`);
console.log(`   https://sepolia.basescan.org/tx/${hash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash });

if (receipt.status === 'success') {
  console.log(`\n🎉 Contract deployed!`);
  console.log(`   Address: ${receipt.contractAddress}`);
  console.log(`   https://sepolia.basescan.org/address/${receipt.contractAddress}`);
  console.log(`\n📋 Next step — add this to your .env:`);
  console.log(`   VITE_ESCROW_CONTRACT_ADDRESS=${receipt.contractAddress}`);
  console.log(`   VITE_ESCROW_CHAIN_ID=84532`);
} else {
  console.error('❌ Deployment failed!');
  console.error(receipt);
  process.exit(1);
}
