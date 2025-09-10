// lib/monitor.js (Corrected with proper TronWeb import)

import { ethers } from 'ethers';
// Change the TronWeb import to handle its specific structure
import _TronWeb from 'tronweb';
const TronWeb = _TronWeb;

// --- Configuration ---
const TRONGRID_API_KEY = '85185b58-af43-4c59-b416-aae95f8cc75f';
const PAYMENT_TOLERANCE_USD = 2.0;

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

// Initialize TronWeb for TRC20 checks using the corrected import
const tronWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io',
    headers: { 'TRON-PRO-API-KEY': TRONGRID_API_KEY }
});


async function checkTransactionStatus(network, address, expectedAmount) {
    // The rest of this function remains exactly the same.
    const debugInfo = { network, address, expectedAmount, tolerance: PAYMENT_TOLERANCE_USD, checkedAt: new Date().toISOString() };

    if (!TOKEN_ADDRESSES[network]) {
        throw new Error(`Unsupported network: ${network}`);
    }

    if (network === 'trc20') {
        try {
            const contract = await tronWeb.contract().at(TOKEN_ADDRESSES.trc20);
            const balance = await contract.balanceOf(address).call();
            const formattedBalance = parseFloat(tronWeb.fromSun(balance));
            debugInfo.balance = formattedBalance;
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