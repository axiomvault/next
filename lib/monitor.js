// lib/monitor.js (With API Key Fallback Logic)

import { ethers } from 'ethers';
import TronWeb from 'tronweb';

// --- Configuration ---
const PAYMENT_TOLERANCE_USD = 2.0;

// **** NEW: Read all keys from your Environment Variable and split them into an array ****
// This securely gets the keys, splits them by the comma, and removes any empty entries.
const TRONGRID_API_KEYS = (process.env.TRONGRID_API_KEYS || '')
  .split(',')
  .filter(key => key.length > 0);

if (TRONGRID_API_KEYS.length === 0) {
    console.error("FATAL: TRONGRID_API_KEYS environment variable is not set or empty.");
}

const TOKEN_ADDRESSES = {
    erc20: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    bep20: '0x55d398326f99059fF775485246999027B3197955',
    trc20: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
};

const ERC20_ABI = [
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)'
];

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

// **** REMOVED: We no longer create one single TronWeb instance. We create it inside the loop. ****


async function checkTransactionStatus(network, address, expectedAmount) {
    const debugInfo = { network, address, expectedAmount, tolerance: PAYMENT_TOLERANCE_USD, checkedAt: new Date().toISOString() };

    if (!TOKEN_ADDRESSES[network]) {
        throw new Error(`Unsupported network: ${network}`);
    }

    // ===============================================
    // === NEW TRC-20 FALLBACK LOGIC START ===
    // ===============================================
    if (network === 'trc20') {
        if (TRONGRID_API_KEYS.length === 0) {
             throw new Error('TRC20 check failed: No API keys are configured on the server.');
        }

        // Loop through each API key until one works
        for (let i = 0; i < TRONGRID_API_KEYS.length; i++) {
            const currentKey = TRONGRID_API_KEYS[i];
            
            try {
                // Create a NEW tronWeb instance for THIS key
                const tronWeb = new TronWeb({
                    fullHost: 'https://api.trongrid.io',
                    headers: { 'TRON-PRO-API-KEY': currentKey }
                });

                const contract = await tronWeb.contract().at(TOKEN_ADDRESSES.trc20);
                const balance = await contract.balanceOf(address).call();

                // **** THIS IS THE FIX FROM BEFORE: Convert BigNumber to string ****
                const formattedBalance = parseFloat(tronWeb.fromSun(balance.toString()));
                
                debugInfo.balance = formattedBalance;
                const minimumRequiredAmount = expectedAmount - PAYMENT_TOLERANCE_USD;

                if (formattedBalance >= minimumRequiredAmount) {
                    // SUCCESS: We found a balance AND the key worked. Return the result.
                    return { confirmed: true, debug: { ...debugInfo, status: 'confirmed', minimumRequired: minimumRequiredAmount, keyIndex: i } };
                } else {
                    // SUCCESS: The key worked, but balance is low. Return the result.
                    return { confirmed: false, debug: { ...debugInfo, status: 'pending', minimumRequired: minimumRequiredAmount, keyIndex: i } };
                }

            } catch (error) {
                // THIS KEY FAILED. Log it and let the loop try the next key.
                console.warn(`TronGrid API Key at index ${i} failed. Error: ${error.message}. Trying next key...`);
            }
        }
        
        // If the loop finishes without ANY key working, throw the final error.
        throw new Error('All TronGrid API keys failed. Check API key limits and validity.');
    }
    // ===============================================
    // === NEW TRC-20 FALLBACK LOGIC END ===
    // ===============================================


    // EVM logic (unchanged)
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
            const minimumRequiredAmount = expectedAmount - PAYMENT_TOLERANCE_USD;
            if (formattedBalance >= minimumRequiredAmount) {
                return { confirmed: true, debug: { ...debugInfo, status: 'confirmed', minimumRequired: minimumRequiredAmount } };
            }
            return { confirmed: false, debug: { ...debugInfo, status: 'pending', minimumRequired: minimumRequiredAmount } };
        } catch (error) {
            console.warn(`Provider failed for ${network}, trying next...`);
        }
    }
    throw new Error(`All providers failed for network: ${network}`);
}

export {
    checkTransactionStatus
};