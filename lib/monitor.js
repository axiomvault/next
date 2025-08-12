const { ethers } = require('ethers');

const usdtContracts = {
  erc20: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  bep20: '0x55d398326f99059fF775485246999027B3197955',
};

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

async function checkTransactionStatus(network, address, expectedAmount) {
  if (!['erc20', 'bep20'].includes(network)) {
    throw new Error(`Unsupported network: ${network}`);
  }
  if (!isEvmAddress(address)) {
    throw new Error(`Invalid EVM address: ${address}`);
  }

  console.log(`🔍 Checking ${network} address ${address} for ~${expectedAmount} USDT`);

  const iface = new ethers.Interface([
    'event Transfer(address indexed from, address indexed to, uint256 value)',
  ]);
  const eventTopic = iface.getEvent('Transfer').topicHash;

  // Ensure address is checksummed for padding
  const paddedTo = ethers.zeroPadValue(address, 32);

  return await tryEvmProvider(rpcProviders[network], async (provider) => {
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(latestBlock - 5000, 0);

    const logs = await provider.getLogs({
      address: usdtContracts[network],
      topics: [eventTopic, null, paddedTo],
      fromBlock,
      toBlock: latestBlock,
    });

    for (const log of logs) {
      const decoded = iface.parseLog(log);
      const amount = Number(decoded.args.value) / 1e6; // USDT has 6 decimals

      if (Math.abs(amount - expectedAmount) < 0.001) {
        const txReceipt = await provider.getTransactionReceipt(log.transactionHash);
        const confirmations = latestBlock - txReceipt.blockNumber + 1;

        return {
          confirmed: confirmations >= 1, // require at least 1 confirmation
          txHash: log.transactionHash,
          confirmations,
        };
      }
    }

    return { confirmed: false };
  });
}

module.exports = {
  checkTransactionStatus,
};
