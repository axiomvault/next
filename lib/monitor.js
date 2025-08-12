const { ethers } = require('ethers');

// USDT contract addresses
const TOKEN_ADDRESSES = {
  erc20: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // Mainnet USDT
  bep20: '0x55d398326f99059fF775485246999027B3197955' // BSC USDT
};

// ABI for balance check only
const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

// Reliable providers only
const PROVIDERS = {
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
  const debugInfo = {
    network,
    address,
    expectedAmount,
    checkedAt: new Date().toISOString(),
    status: 'checking',
    balance: null,
    matched: false
  };

  try {
    if (!TOKEN_ADDRESSES[network]) {
      throw new Error(`Unsupported network: ${network}`);
    }

    const tokenAddress = TOKEN_ADDRESSES[network];
    const providers = PROVIDERS[network];
    
    // Try each provider until we get a response
    for (const provider of providers) {
      try {
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        
        // Get current balance and decimals
        const [balance, decimals] = await Promise.all([
          tokenContract.balanceOf(address),
          tokenContract.decimals()
        ]);

        debugInfo.balance = ethers.utils.formatUnits(balance, decimals);
        debugInfo.decimals = decimals;

        // Calculate acceptable range (±1 USDT)
        const expectedAmountWei = ethers.utils.parseUnits(expectedAmount.toString(), decimals);
        const minAmount = expectedAmountWei.sub(ethers.utils.parseUnits('1', decimals));
        
        // Check if balance meets requirement
        if (balance.gte(minAmount)) {
          debugInfo.status = 'confirmed';
          debugInfo.matched = true;
          return {
            confirmed: true,
            debug: debugInfo
          };
        }

        debugInfo.status = 'pending';
        return {
          confirmed: false,
          debug: debugInfo
        };

      } catch (error) {
        debugInfo.error = error.message;
        // Try next provider if available
        continue;
      }
    }

    // If all providers failed
    throw new Error('All providers failed');

  } catch (error) {
    debugInfo.status = 'error';
    debugInfo.error = error.message;
    throw error;
  }
}

module.exports = {
  checkTransactionStatus
};