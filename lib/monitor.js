const { ethers } = require('ethers');

// USDT contract addresses
const TOKEN_ADDRESSES = {
  erc20: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // Mainnet USDT
  bep20: '0x55d398326f99059fF775485246999027B3197955' // BSC USDT
};

// ABI for ERC-20 token
const ERC20_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

// RPC providers with fallbacks
const PROVIDERS = {
  erc20: [
    new ethers.providers.JsonRpcProvider('https://rpc.ankr.com/eth/5c4533c0f82eb05973b9e3b824c0162c2f84044d57a5865b5a006209df5ad469'),
    new ethers.providers.JsonRpcProvider('https://mainnet.infura.io/v3/c62df08267f24d1993ae7c57ef5bc5cf')
  ],
  bep20: [
    new ethers.providers.JsonRpcProvider('https://bsc.publicnode.com')
  ]
};

// Cache for already processed transactions
const processedTransactions = new Set();

async function checkTransactionStatus(network, address, expectedAmount) {
  const debugInfo = {
    network,
    address,
    expectedAmount,
    checkedAt: new Date().toISOString(),
    providerUrls: PROVIDERS[network].map(p => p.connection.url),
    error: null,
    transactionsChecked: 0,
    balanceChecks: 0
  };

  try {
    if (!TOKEN_ADDRESSES[network]) {
      throw new Error(`Unsupported network: ${network}`);
    }

    const tokenAddress = TOKEN_ADDRESSES[network];
    const providers = PROVIDERS[network];
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, providers[0]);

    // Check current balance first (fastest method)
    debugInfo.balanceChecks++;
    const currentBalance = await getTokenBalance(tokenContract, address);
    const decimals = await tokenContract.decimals();
    const expectedAmountWei = ethers.utils.parseUnits(expectedAmount.toString(), decimals);
    
    // Allow ±1 USDT variance
    const minAmount = expectedAmountWei.sub(ethers.utils.parseUnits('1', decimals));
    const maxAmount = expectedAmountWei.add(ethers.utils.parseUnits('1', decimals));

    if (currentBalance.gte(minAmount)) {
      debugInfo.status = 'balance_met';
      return {
        confirmed: true,
        txHash: 'balance_check',
        debug: debugInfo
      };
    }

    // If balance not met, check recent transactions
    const latestBlock = await providers[0].getBlockNumber();
    const fromBlock = Math.max(0, latestBlock - 5000); // Check last ~5000 blocks

    debugInfo.fromBlock = fromBlock;
    debugInfo.toBlock = latestBlock;

    const filter = tokenContract.filters.Transfer(null, address);
    const events = await tokenContract.queryFilter(filter, fromBlock, latestBlock);

    for (const event of events) {
      debugInfo.transactionsChecked++;
      const txHash = event.transactionHash;

      if (processedTransactions.has(txHash)) {
        continue;
      }

      processedTransactions.add(txHash);
      const tx = await providers[0].getTransactionReceipt(txHash);

      if (tx && tx.status === 1) { // Only confirmed transactions
        const value = event.args.value;
        if (value.gte(minAmount) && value.lte(maxAmount)) {
          debugInfo.status = 'transaction_found';
          debugInfo.confirmedTx = txHash;
          return {
            confirmed: true,
            txHash,
            debug: debugInfo
          };
        }
      }
    }

    debugInfo.status = 'not_found';
    return {
      confirmed: false,
      debug: debugInfo
    };

  } catch (error) {
    debugInfo.error = error.message;
    debugInfo.status = 'error';
    
    // Try fallback providers if available
    if (PROVIDERS[network].length > 1) {
      debugInfo.fallbackAttempted = true;
      return checkWithFallbackProvider(network, address, expectedAmount, debugInfo);
    }

    throw error;
  }
}

async function checkWithFallbackProvider(network, address, expectedAmount, debugInfo) {
  const tokenAddress = TOKEN_ADDRESSES[network];
  
  for (let i = 1; i < PROVIDERS[network].length; i++) {
    try {
      const provider = PROVIDERS[network][i];
      debugInfo.currentProvider = provider.connection.url;
      
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      const currentBalance = await getTokenBalance(tokenContract, address);
      const decimals = await tokenContract.decimals();
      const expectedAmountWei = ethers.utils.parseUnits(expectedAmount.toString(), decimals);
      const minAmount = expectedAmountWei.sub(ethers.utils.parseUnits('1', decimals));

      if (currentBalance.gte(minAmount)) {
        debugInfo.status = 'balance_met_fallback';
        return {
          confirmed: true,
          txHash: 'balance_check_fallback',
          debug: debugInfo
        };
      }

      // If we get here, no balance found with fallback either
      return {
        confirmed: false,
        debug: debugInfo
      };

    } catch (error) {
      debugInfo.error = `Fallback ${i} failed: ${error.message}`;
      continue;
    }
  }

  throw new Error('All providers failed');
}

async function getTokenBalance(tokenContract, address) {
  try {
    return await tokenContract.balanceOf(address);
  } catch (error) {
    console.error('Error getting token balance:', error);
    throw error;
  }
}

module.exports = {
  checkTransactionStatus
};