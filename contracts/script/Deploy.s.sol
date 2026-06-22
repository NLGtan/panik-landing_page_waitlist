// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { PanikEscrow } from "../src/PanikEscrow.sol";

/**
 * @title  DeployPanikEscrow
 * @notice Deployment script for the PanikEscrow contract.
 *
 * @dev    Usage:
 *
 *         Base Sepolia (testnet):
 *         forge script script/Deploy.s.sol:DeployPanikEscrow \
 *           --rpc-url base_sepolia \
 *           --broadcast \
 *           --verify \
 *           -vvvv
 *
 *         Base Mainnet:
 *         forge script script/Deploy.s.sol:DeployPanikEscrow \
 *           --rpc-url base \
 *           --broadcast \
 *           --verify \
 *           -vvvv
 *
 *         Environment variables:
 *           PRIVATE_KEY           — deployer wallet private key
 *           USDC_ADDRESS          — USDC token address on the target chain
 *           OWNER_ADDRESS         — initial owner (team EOA or multisig)
 *           TREASURY_ADDRESS      — where released funds go
 */
contract DeployPanikEscrow is Script {
    // Base Mainnet USDC
    address constant BASE_MAINNET_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    // Base Sepolia USDC (circle-issued test USDC)
    address constant BASE_SEPOLIA_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address ownerAddr = vm.envAddress("OWNER_ADDRESS");
        address treasuryAddr = vm.envAddress("TREASURY_ADDRESS");

        // Auto-detect USDC address from chain ID, with env override
        address usdcAddr;
        try vm.envAddress("USDC_ADDRESS") returns (address envUsdc) {
            usdcAddr = envUsdc;
        } catch {
            if (block.chainid == 8453) {
                usdcAddr = BASE_MAINNET_USDC;
            } else if (block.chainid == 84532) {
                usdcAddr = BASE_SEPOLIA_USDC;
            } else {
                revert("Set USDC_ADDRESS env var for this chain");
            }
        }

        console2.log("Deploying PanikEscrow...");
        console2.log("  Chain ID:  ", block.chainid);
        console2.log("  USDC:      ", usdcAddr);
        console2.log("  Owner:     ", ownerAddr);
        console2.log("  Treasury:  ", treasuryAddr);

        vm.startBroadcast(deployerKey);

        PanikEscrow escrow = new PanikEscrow(usdcAddr, ownerAddr, treasuryAddr);

        vm.stopBroadcast();

        console2.log("  Escrow deployed at:", address(escrow));
    }
}
