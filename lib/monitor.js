// lib/monitor.js

// Using ethers.js to interact with the Ethereum and BSC blockchains.
// Make sure to add it to your project: npm install ethers
const { ethers } = require('ethers');

// --- Configuration ---

// RPC URLs for the supported networks.
// It's good practice to have fallbacks.
const RPC_URLS = {
    eth: [
        'https://mainnet.infura.io/v3/c62df08267f24d1993ae7c57ef5bc5cf',
        'https://rpc.ankr.com/eth/5c4533c0f82eb05973b9e3b824c0162c2f84044d57a5865b5a006209df5ad469'
    ],
    bsc: [
        'https://bsc-dataseed.binance.org/',
        'https://bsc.publicnode.com',
        'https://rpc.ankr.com/bsc'
    ]
};

// USDT Contract addresses on each network
const USDT_CONTRACT_ADDRESSES = {
    eth: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // ERC-20 USDT on Ethereum
    bsc: '0x55d398326f99059fF775485246999027B3197955'  // BEP-20 USDT on Binance Smart Chain
};

// The part of the ERC-20 ABI we need to listen for Transfer events.
const USDT_ABI = [
    "event Transfer(address indexed from, address indexed to, uint256 value)"
];

// Number of block confirmations required for a transaction to be considered secure.
const REQUIRED_CONFIRMATIONS = 12;

// How many of the latest blocks to scan for transactions.
// A larger number might be slower but catches transactions from further back.
const BLOCK_SCAN_RANGE = 200; 

/**
 * Checks for a confirmed USDT transaction to a specific address.
 *
 * @param {string} network - The network to check ('eth', 'erc20', 'bsc', or 'bep20').
 * @param {string} recipientAddress - The wallet address that should receive the payment.
 * @param {number} expectedAmount - The expected amount of USDT.
 * @returns {Promise<object>} A promise that resolves to an object containing the confirmation status.
 */
async function checkTransactionStatus(network, recipientAddress, expectedAmount) {
    const debugInfo = {
        network,
        recipientAddress,
        expectedAmount,
        rpcUrls: [],
        usdtContract: '',
        latestBlock: 0,
        scanRange: BLOCK_SCAN_RANGE,
        requiredConfirmations: REQUIRED_CONFIRMATIONS,
        seenTxs: [],
        reason: ''
    };

    try {
        // 1. Select Network Configuration
        let lowerNetwork = network.toLowerCase();
        
        // Treat 'bep20' as an alias for 'bsc'
        if (lowerNetwork === 'bep20') {
            lowerNetwork = 'bsc';
        }
        // Treat 'erc20' as an alias for 'eth'
        if (lowerNetwork === 'erc20') {
            lowerNetwork = 'eth';
        }

        const rpcUrls = RPC_URLS[lowerNetwork];
        const usdtContractAddress = USDT_CONTRACT_ADDRESSES[lowerNetwork];

        if (!rpcUrls || !usdtContractAddress) {
            throw new Error(`Unsupported network: ${network}. Supported networks are 'eth'/'erc20' and 'bsc'/'bep20'.`);
        }
        debugInfo.rpcUrls = rpcUrls;
        debugInfo.usdtContract = usdtContractAddress;

        // 2. Connect to a Blockchain Node
        // StaticJsonRpcProvider is generally faster for queries that don't change state.
        const provider = new ethers.providers.StaticJsonRpcProvider(rpcUrls[0]);
        
        // 3. Setup Contract Instance
        const usdtContract = new ethers.Contract(usdtContractAddress, USDT_ABI, provider);

        // 4. Get the latest block number to calculate confirmations
        const latestBlock = await provider.getBlockNumber();
        debugInfo.latestBlock = latestBlock;

        // 5. Create a filter to find 'Transfer' events sent *to* our recipientAddress
        const filter = usdtContract.filters.Transfer(null, recipientAddress);

        // 6. Query the blockchain for events in the recent past
        const events = await usdtContract.queryFilter(filter, latestBlock - BLOCK_SCAN_RANGE, latestBlock);

        if (events.length === 0) {
            debugInfo.reason = 'No recent USDT transfer events found for this address.';
            return { confirmed: false, txHash: null, debug: debugInfo };
        }

        // 7. Process events from newest to oldest to find a valid transaction
        for (const event of events.reverse()) {
            const confirmations = latestBlock - event.blockNumber;
            // USDT has 6 decimal places
            const amountReceived = parseFloat(ethers.utils.formatUnits(event.args.value, 6)); 
            
            debugInfo.seenTxs.push({
                txHash: event.transactionHash,
                blockNumber: event.blockNumber,
                confirmations: confirmations,
                amount: amountReceived
            });

            // Check if the transaction meets our criteria
            const isConfirmed = confirmations >= REQUIRED_CONFIRMATIONS;
            // Check if the amount is within the acceptable tolerance (e.g., expectedAmount +/- 1)
            const isAmountMatch = Math.abs(amountReceived - expectedAmount) <= 1.0;

            if (isConfirmed && isAmountMatch) {
                debugInfo.reason = `Confirmed transaction found: ${event.transactionHash}`;
                return {
                    confirmed: true,
                    txHash: event.transactionHash,
                    debug: debugInfo
                };
            }
        }

        debugInfo.reason = 'Found transactions, but none met the confirmation and amount requirements yet.';
        return { confirmed: false, txHash: null, debug: debugInfo };

    } catch (error) {
        console.error("Error in checkTransactionStatus:", error);
        debugInfo.reason = `An unexpected error occurred: ${error.message}`;
        // Re-throw the error to be caught by the API handler, which will send a 500 response
        throw new Error(debugInfo.reason);
    }
}

module.exports = {
    checkTransactionStatus
};
