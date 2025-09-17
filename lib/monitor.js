// lib/monitor.js (With new robust TronWeb constructor)

import { ethers } from 'ethers';
import TronWeb from 'tronweb';

// --- Configuration ---
const PAYMENT_TOLERANCE_USD = 2.0;

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

async function checkTransactionStatus(network, address, expectedAmount) {
    const debugInfo = { network, address, expectedAmount, tolerance: PAYMENT_TOLERANCE_USD, checkedAt: new Date().toISOString() };

    if (!TOKEN_ADDRESSES[network]) {
        throw new Error(`Unsupported network: ${network}`);
    }

    if (network === 'trc20') {
        if (TRONGRID_API_KEYS.length === 0) {
             throw new Error('TRC20 check failed: No API keys are configured on the server.');
        }

        // Loop through each API key until one works
        for (let i = 0; i < TRONGRID_API_KEYS.length; i++) {
            const currentKey = TRONGRID_API_KEYS[i];
            
            try {
                // **** THIS IS THE FIX: Use the full, explicit constructor ****
                // TronWeb's simple object constructor can be buggy. This is the reliable method.
                // We pass a dummy private key because the library sometimes expects it, even for read-only calls.
                const tronWeb = new TronWeb(
                    'https://api.trongrid.io', // fullHost
                    'https://api.trongrid.io', // solidityHost
                    'https://api.trongrid.io', // eventServer
                    '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF' // Dummy key, not used
                );
                
                // Set the API key using the dedicated method
                tronWeb.setHeader({ 'TRON-PRO-API-KEY': currentKey });
                // **** END OF FIX ****

                
                const contract = await tronWeb.contract().at(TOKEN_ADDRESSES.trc20);
                const balance = await contract.balanceOf(address).call();
                const formattedBalance = parseFloat(tronWeb.fromSun(balance.toString()));
                
                debugInfo.balance = formattedBalance;
                const minimumRequiredAmount = expectedAmount - PAYMENT_TOLERANCE_USD;

                if (formattedBalance >= minimumRequiredAmount) {
                    return { confirmed: true, debug: { ...debugInfo, status: 'confirmed', minimumRequired: minimumRequiredAmount, keyIndex: i } };
                } else {
                    return { confirmed: false, debug: { ...debugInfo, status: 'pending', minimumRequired: minimumRequiredAmount, keyIndex: i } };
                }

            } catch (error) {
                // This key failed. Log the full error and try the next key.
                console.warn(`TronGrid API Key at index ${i} failed. Trying next key. Full Error:`, error);
            }
        }
        
        // If the loop finishes without ANY key working, throw the final error.
        throw new Error('All TronGrid API keys failed. Check API key limits and validity.');
    }

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