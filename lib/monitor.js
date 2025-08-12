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
      console.log(`🌐 Trying RPC: ${url}`);
      const provider = new ethers.JsonRpcProvider(url);
      return await callback(provider, url);
    } catch (err) {
      console.warn(`⚠️ RPC failed: ${url}`, err.message);
    }
  }
  throw new Error('All RPC providers failed.');
}

async function checkTransactionStatus(network, address, expectedAmount) {
  console.log(`🔍 Checking ${network} address: ${address} for amount: ${expectedAmount}`);

  if (!isEvmAddress(address)) {
    throw new Error(`Invalid EVM address: ${address}`);
  }

  const checksumAddress = ethers.getAddress(address); // ✅ ensures proper format
  const iface = new ethers.Interface([
    'event Transfer(address indexed from, address indexed to, uint256 value)',
  ]);

  const eventTopic = iface.getEvent('Transfer').topicHash;
  const paddedTo = ethers.zeroPadValue(checksumAddress, 32);

  return await tryEvmProvider(rpcProviders[network], async (provider, rpcUrl) => {
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(latestBlock - 5000, 0); // ✅ wider search window

    console.log(`📦 Using RPC: ${rpcUrl}`);
    console.log(`📦 Current block: ${latestBlock}`);
    console.log(`📦 Scanning from block ${fromBlock} to ${latestBlock}`);

    const logs = await provider.getLogs({
      address: usdtContracts[network],
      topics: [eventTopic, null, paddedTo],
      fromBlock,
      toBlock: latestBlock,
    });

    console.log(`📜 Found ${logs.length} matching logs for ${checksumAddress}`);

    for (const log of logs) {
      const decoded = iface.parseLog(log);
      const amount = Number(decoded.args.value) / 1e6;
      console.log(`💰 Tx: ${log.transactionHash} | Amount: ${amount}`);

      if (Math.abs(amount - expectedAmount) <= 1) {
        console.log(`✅ Match found within tolerance ±1 USDT for tx: ${log.transactionHash}`);
        return {
          confirmed: true,
          txHash: log.transactionHash,
          confirmations: 1,
        };
      } else {
        console.log(`⏩ Skipped tx: ${log.transactionHash} | Amount difference: ${Math.abs(amount - expectedAmount)}`);
      }
    }

    console.log(`❌ No matching transactions found for ${checksumAddress} in last 5000 blocks`);
    return { confirmed: false };
  });
}

module.exports = {
  checkTransactionStatus,
};
