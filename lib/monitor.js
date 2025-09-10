// lib/monitor.js (Corrected Version)

import { ethers } from 'ethers';
import TronWeb from 'tronweb';

// --- Configuration ---

// REQUIRED: Add your TronGrid API key here for reliable TRON network access.
// It is highly recommended to store this in an environment variable (e.g., process.env.TRONGRID_API_KEY).
const TRONGRID_API_KEY = '85185b58-af43-4c59-b416-aae95f8cc75f';

// The amount of tolerance to allow for payments (e.g., for exchange fees).
const PAYMENT_TOLERANCE_USD = 2.0;

// USDT Contract Addresses for each network
const TOKEN_ADDRESSES = {
    erc20: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // Ethereum Mainnet USDT
    bep20: '0x55d398326f99059fF775485246999027B3197955', // Binance Smart Chain USDT
    trc20: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'       // TRON USDT (TRC20)
};

// ABI (Application Binary Interface) snippets needed to interact with the contracts
const ERC20_ABI = [
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)'
];

// Reliable provider URLs for Ethereum (ERC20) and BSC (BEP20) networks
const EVM_PROVIDERS = {
    erc20: [
        new ethers.providers.JsonRpcProvider('https://eth.llamarpc.com'),
        new ethers.providers.JsonRpcProvider('https://rpc.ankr.com/eth')
    ],
    bep20: [
        new ethers.providers.JsonRpcProvider('https://bsc-dataseed1.binance.org'),
        new ethers.providers.JsonRpcProvider('https://bsc-dataseed2.binance.org')
    ]
};

// Initialize TronWeb for TRC20 checks
const tronWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io',
    headers: { 'TRON-PRO-API-KEY': TRONGRID_API_KEY }
});


/**
 * Checks the USDT balance of a given address on a specified blockchain network with a tolerance.
 * @param {string} network - The network to check ('erc20', 'bep20', 'trc20').
 * @param {string} address - The wallet address to check.
 * @param {number} expectedAmount - The amount expected to be in the wallet.
 * @returns {Promise<{confirmed: boolean, debug: object}>} - The confirmation status and debug info.
 */
async function checkTransactionStatus(network, address, expectedAmount) {
    const debugInfo = { network, address, expectedAmount, tolerance: PAYMENT_TOLERANCE_USD, checkedAt: new Date().toISOString() };

    if (!TOKEN_ADDRESSES[network]) {
        throw new Error(`Unsupported network: ${network}`);
    }

    // --- TRC20 (TRON) LOGIC ---
    if (network === 'trc20') {
        try {
            const contract = await tronWeb.contract().at(TOKEN_ADDRESSES.trc20);
            const balance = await contract.balanceOf(address).call();
            
            // TRC20 USDT has 6 decimals.
            const formattedBalance = parseFloat(tronWeb.fromSun(balance));
            debugInfo.balance = formattedBalance;

            // **TOLERANCE CHECK**: The received amount must be >= (expected amount - tolerance).
            const minimumRequiredAmount = expectedAmount - PAYMENT_TOLERANCE_USD;
            if (formattedBalance >= minimumRequiredAmount) {
                return { confirmed: true, debug: { ...debugInfo, status: 'confirmed', minimumRequired: minimumRequiredAmount } };
            } else {
                return { confirmed: false, debug: { ...debugInfo, status: 'pending', minimumRequired: minimumRequiredAmount } };
            }
        } catch (error) {
            console.error(`TRC20 check failed for ${address}:`, error);
            throw new Error('Failed to query TRON network. Check your TronGrid API Key.');
        }
    }

    // --- ERC20 / BEP20 (EVM) LOGIC ---
    const providers = EVM_PROVIDERS[network];
    for (const provider of providers) {
        try {
            const tokenContract = new ethers.Contract(TOKEN_ADDRESSES[network], ERC20_ABI, provider);
            const [balance, decimals] = await Promise.all([
                tokenContract.balanceOf(address),
                tokenContract.decimals()
            ]);
            
            const formattedBalance = parseFloat(ethers.utils.formatUnits(balance, decimals));
            debugInfo.balance = formattedBalance;
            
            // **TOLERANCE CHECK**: The received amount must be >= (expected amount - tolerance).
            const minimumRequiredAmount = expectedAmount - PAYMENT_TOLERANCE_USD;
            if (formattedBalance >= minimumRequiredAmount) {
                return { confirmed: true, debug: { ...debugInfo, status: 'confirmed', minimumRequired: minimumRequiredAmount } };
            }
            // If we get a valid response but it's not enough, we stop and report pending.
            return { confirmed: false, debug: { ...debugInfo, status: 'pending', minimumRequired: minimumRequiredAmount } };

        } catch (error) {
            console.warn(`Provider failed for ${network}, trying next...`);
            // If one provider fails, the loop will automatically try the next one.
        }
    }

    // This error is thrown only if all providers for a given EVM network have failed.
    throw new Error(`All providers failed for network: ${network}`);
}

// Use the ES Module 'export' syntax instead of 'module.exports'
export {
    checkTransactionStatus
};