const axios = require('axios');
const { ethers } = require('ethers');

// ===== CONFIGURATION =====
// Add your API keys here if needed
const TRONSCAN_API_KEY = '23aa4bed-9202-420e-8a8d-4f0dfa5843a9'; // Get from https://tronscan.org
const TRONGRID_API_KEY = '85185b58-af43-4c59-b416-aae95f8cc75f'; // Get from https://tron.network

const usdtContracts = {
  erc20: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  bep20: '0x55d398326f99059fF775485246999027B3197955',
  trc20: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' // USDT TRC20 contract
};

const rpcProviders = {
  erc20: [
    'https://mainnet.infura.io/v3/c62df08267f24d1993ae7c57ef5bc5cf',
    'https://rpc.ankr.com/eth'
  ],
  bep20: [
    'https://bsc.publicnode.com',
    'https://rpc.ankr.com/bsc'
  ],
  trc20: [
    'https://api.trongrid.io'
  ]
};

// ===== HELPER FUNCTIONS =====
function isTronAddress(address) {
  return /^T[a-zA-Z0-9]{33}$/.test(address);
}

function isEvmAddress(address) {
  try {
    return ethers.isAddress(address);
  } catch {
    return false;
  }
}

async function tryEvmProvider(providers, callback) {
  for (let url of providers) {
    try {
      const provider = new ethers.JsonRpcProvider(url);
      return await callback(provider);
    } catch (err) {
      console.warn(`⚠️ RPC failed: ${url}`, err.message);
    }
  }
  throw new Error('All RPC providers failed.');
}

async function checkTronTransaction(address, expectedAmount) {
  const endpoints = [
    {
      url: `https://apilist.tronscanapi.com/api/token_trc20/transfers`,
      params: {
        toAddress: address,
        contract_address: usdtContracts.trc20,
        limit: 20,
        sort: '-timestamp'
      },
      headers: { 'TRON-PRO-API-KEY': TRONSCAN_API_KEY }
    },
    {
      url: `https://api.trongrid.io/v1/accounts/${address}/transactions/trc20`,
      params: {
        contract_address: usdtContracts.trc20,
        limit: 20,
        order_by: 'block_timestamp,desc'
      },
      headers: { 'TRON-PRO-API-KEY': TRONGRID_API_KEY }
    }
  ];

  for (let attempt = 0; attempt < endpoints.length; attempt++) {
    try {
      const { url, params, headers } = endpoints[attempt];
      const res = await axios.get(url, { params, headers });
      
      const transfers = res.data?.token_transfers || res.data?.data || [];
      
      const tx = transfers.find(t => {
        const amount = Number(t.amount || t.value) / 1e6;
        return (
          t.token_info?.symbol === 'USDT' &&
          t.to_address?.toLowerCase() === address.toLowerCase() &&
          Math.abs(amount - expectedAmount) < 0.001
        );
      });

      if (tx) {
        return {
          confirmed: true,
          txHash: tx.transaction_id || tx.transactionHash,
          confirmations: tx.confirmations || (tx.blockNumber ? 1 : 0)
        };
      }
      return { confirmed: false };
    } catch (err) {
      console.warn(`Tron API attempt ${attempt + 1} failed:`, err.message);
      if (attempt === endpoints.length - 1) {
        throw new Error('All Tron API endpoints failed');
      }
    }
  }
}

// ===== MAIN FUNCTION =====
async function checkTransactionStatus(network, address, expectedAmount) {
  console.log(`🔍 Checking ${network} address: ${address} for amount: ${expectedAmount}`);

  if (network === 'trc20') {
    if (!isTronAddress(address)) {
      throw new Error(`Invalid TRON address: ${address}`);
    }
    return await checkTronTransaction(address, expectedAmount);
  }

  if (!isEvmAddress(address)) {
    throw new Error(`Invalid EVM address: ${address}`);
  }

  const iface = new ethers.Interface([
    'event Transfer(address indexed from, address indexed to, uint256 value)',
  ]);

  const eventTopic = iface.getEvent('Transfer').topicHash;
  const paddedTo = ethers.zeroPadValue(address.toLowerCase(), 32);

  return await tryEvmProvider(rpcProviders[network], async (provider) => {
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(latestBlock - 1500, 0);

    const logs = await provider.getLogs({
      address: usdtContracts[network],
      topics: [eventTopic, null, paddedTo],
      fromBlock,
      toBlock: latestBlock,
    });

    for (const log of logs) {
      const decoded = iface.parseLog(log);
      const amount = Number(decoded.args.value) / 1e6;

      if (Math.abs(amount - expectedAmount) < 0.001) {
        return {
          confirmed: true,
          txHash: log.transactionHash,
          confirmations: latestBlock - log.blockNumber + 1,
        };
      }
    }

    return { confirmed: false };
  });
}

module.exports = {
  checkTransactionStatus,
};