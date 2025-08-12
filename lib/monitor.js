const axios = require('axios');
const { ethers } = require('ethers');

// ===== CONFIGURATION =====
const API_KEYS = {
  tronscan: '23aa4bed-9202-420e-8a8d-4f0dfa5843a9',
  trongrid: '85185b58-af43-4c59-b416-aae95f8cc75f'
};

const CONTRACT_ADDRESSES = {
  erc20: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // Mainnet USDT
  bep20: '0x55d398326f99059fF775485246999027B3197955', // BSC USDT
  trc20: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' // TRON USDT
};

const RPC_ENDPOINTS = {
  erc20: [
    'https://cloudflare-eth.com',
    'https://rpc.ankr.com/eth'
  ],
  bep20: [
    'https://bsc-dataseed.binance.org',
    'https://rpc.ankr.com/bsc'
  ],
  trc20: [
    'https://api.trongrid.io'
  ]
};

// ===== TRON IMPLEMENTATION =====
async function verifyTronPayment(address, amount, timestamp) {
  const expectedInSun = Math.round(amount * 1e6); // USDT has 6 decimals
  const endpoints = [
    {
      name: 'Tronscan',
      url: 'https://apilist.tronscanapi.com/api/token_trc20/transfers',
      params: {
        toAddress: address,
        contract_address: CONTRACT_ADDRESSES.trc20,
        limit: 5,
        sort: '-timestamp',
        start_timestamp: timestamp - 300000 // 5 min window
      },
      headers: { 'TRON-PRO-API-KEY': API_KEYS.tronscan }
    },
    {
      name: 'Trongrid',
      url: `https://api.trongrid.io/v1/accounts/${address}/transactions/trc20`,
      params: {
        contract_address: CONTRACT_ADDRESSES.trc20,
        only_to: true,
        limit: 5,
        order_by: 'block_timestamp,desc',
        min_timestamp: timestamp - 300000
      },
      headers: { 'TRON-PRO-API-KEY': API_KEYS.trongrid }
    }
  ];

  for (const endpoint of endpoints) {
    try {
      const { data } = await axios.get(endpoint.url, {
        params: endpoint.params,
        headers: endpoint.headers,
        timeout: 5000
      });

      const transfers = data?.token_transfers || data?.data || [];
      
      for (const tx of transfers) {
        const actualAmount = Number(tx.amount || tx.value);
        if (Math.abs(actualAmount - expectedInSun) <= 100) { // ±100 satoshi tolerance
          return {
            confirmed: true,
            txHash: tx.transaction_id || tx.transactionHash,
            confirmations: tx.confirmations || (tx.blockNumber ? 1 : 0),
            blockNumber: tx.blockNumber,
            timestamp: tx.block_timestamp || Date.now()
          };
        }
      }
    } catch (error) {
      console.warn(`${endpoint.name} check failed:`, error.message);
    }
  }

  return { confirmed: false };
}

// ===== EVM IMPLEMENTATION (ERC20/BEP20) =====
async function verifyEvmPayment(network, address, amount, timestamp) {
  const iface = new ethers.Interface([
    'event Transfer(address indexed from, address indexed to, uint256 value)'
  ]);
  const eventTopic = iface.getEvent('Transfer').topicHash;
  const paddedTo = ethers.zeroPadValue(address, 32);

  for (const rpcUrl of RPC_ENDPOINTS[network]) {
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const latestBlock = await provider.getBlockNumber();
      
      const logs = await provider.getLogs({
        address: CONTRACT_ADDRESSES[network],
        topics: [eventTopic, null, paddedTo],
        fromBlock: latestBlock - 1500, // ~1 hour window
        toBlock: latestBlock
      });

      for (const log of logs) {
        const decoded = iface.parseLog(log);
        const actualAmount = Number(decoded.args.value) / 1e6;
        
        if (Math.abs(actualAmount - amount) < 0.001) { // ±0.001 USDT tolerance
          const tx = await provider.getTransaction(log.transactionHash);
          return {
            confirmed: true,
            txHash: log.transactionHash,
            confirmations: latestBlock - log.blockNumber,
            blockNumber: log.blockNumber,
            timestamp: (await provider.getBlock(log.blockNumber)).timestamp * 1000
          };
        }
      }
    } catch (error) {
      console.warn(`RPC ${network} failed (${rpcUrl}):`, error.message);
    }
  }

  return { confirmed: false };
}

// ===== MAIN FUNCTION =====
async function checkTransactionStatus(network, address, amount, timestamp) {
  try {
    // Validate address format
    if (network === 'trc20') {
      if (!/^T[a-zA-Z0-9]{33}$/.test(address)) {
        throw new Error('Invalid TRON address format');
      }
      return await verifyTronPayment(address, amount, timestamp);
    } 
    
    // EVM networks
    if (!ethers.isAddress(address)) {
      throw new Error('Invalid EVM address format');
    }
    return await verifyEvmPayment(network, address, amount, timestamp);
    
  } catch (error) {
    console.error(`[${network}] Verification error:`, error);
    throw error;
  }
}

module.exports = { checkTransactionStatus };