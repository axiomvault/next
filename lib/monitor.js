export async function checkTransactionStatus(network, address, planAmount) {
  const rpcUrls = {
    bsc: 'https://bsc-dataseed.binance.org/',
    eth: 'https://rpc.ankr.com/eth',
  };

  if (!rpcUrls[network]) {
    throw new Error(`Unsupported network: ${network}`);
  }

  const rpcUrl = rpcUrls[network];

  // 1️⃣ Get latest block number
  const latestBlockRes = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_blockNumber',
      params: [],
      id: 1
    })
  });
  const latestBlockData = await latestBlockRes.json();
  const latestBlock = parseInt(latestBlockData.result, 16);

  const startBlock = latestBlock - 1500;
  const tolerance = 0.5; // ±0.50 USDT

  // 2️⃣ Scan recent blocks for a matching transaction
  for (let block = latestBlock; block >= startBlock; block--) {
    const blockRes = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getBlockByNumber',
        params: ['0x' + block.toString(16), true],
        id: 1
      })
    });
    const blockData = await blockRes.json();

    if (blockData.result?.transactions?.length) {
      for (const tx of blockData.result.transactions) {
        if (tx.to && tx.to.toLowerCase() === address.toLowerCase()) {
          const txValue = parseFloat(parseInt(tx.value, 16) / 1e18);
          if (Math.abs(txValue - planAmount) <= tolerance) {
            return { confirmed: true, txHash: tx.hash };
          }
        }
      }
    }
  }

  return { confirmed: false };
}
