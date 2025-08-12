// lib/monitor.js
const axios = require('axios');
const { ethers } = require('ethers');

// USDT contract addresses for ERC-20 and BEP-20
const usdtContracts = {
  erc20: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // Ethereum USDT
  bep20: '0x55d398326f99059fF775485246999027B3197955', // BSC USDT
};

// RPC providers
const rpcProviders = {
  erc20: [
    'https://mainnet.infura.io/v3/c62df08267f24d1993ae7c57ef5bc5cf',
    'https://rpc.ankr.com/eth/5c4533c0f82eb05973b9e3b824c0162c2f84044d57a5865b5a006209df5ad469',
  ],
  bep20: [
    'https://bsc.publicnode.com',
    'https://rpc.ankr.com/bsc/5c4533c0f82eb05973b9e3b824c0162c2f84044d57a5865b5a006209df5ad469',
  ],
};

// Check if valid EVM address
function isEvmAddress(address) {
  try {
    return ethers.isAddress(address);
  } catch {
    return false;
  }
}

// Try multiple providers until one works
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

async function checkTransactionStatus(network, address, expectedAmount) {
  console.log(`🔍 Checking ${network} address: ${address} for amount: ${expectedAmount}`);

  // Validate network
  if (!['erc20', 'bep20'].includes(network)) {
    throw new Error(`Unsupported network: ${network}`);
  }

  // Validate address
  if (!isEvmAddress(address)) {
    throw new Error(`Invalid EVM address: ${address}`);
  }

  // ERC20 Transfer event ABI
  const iface = new ethers.Interface([
    'event Transfer(address indexed from, address indexed to, uint256 value)',
  ]);
  const eventTopic = iface.getEvent('Transfer').topicHash;
  const paddedTo = ethers.zeroPadValue(address.toLowerCase(), 32);

  // Scan blockchain logs
  return await tryEvmProvider(rpcProviders[network], async (provider) => {
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(latestBlock - 1500, 0);

    console.log(`📡 Scanning ${network} from block ${fromBlock} to ${latestBlock}`);

    const logs = await provider.getLogs({
      address: usdtContracts[network],
      topics: [eventTopic, null, paddedTo],
      fromBlock,
      toBlock: latestBlock,
    });

    for (const log of logs) {
      const decoded = iface.parseLog(log);
      const amount = Number(decoded.args.value) / 1e6; // USDT has 6 decimals

      // Allow ±0.50 USDT variance
      if (Math.abs(amount - expectedAmount) <= 0.50) {
        console.log(`✅ Match found: ${amount} USDT`);
        return {
          confirmed: true,
          txHash: log.transactionHash,
          confirmations: 1,
        };
      }
    }

    return { confirmed: false };
  });
}

module.exports = {
  checkTransactionStatus,
};
