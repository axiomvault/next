// pages/api/monitor.js
import fetch from 'node-fetch';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { address, amount, network } = req.query;

  console.log('[MONITOR] Query received:', { address, amount, network });

  if (!address || !amount || !network) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount)) {
      throw new Error(`Invalid amount format: ${amount}`);
    }

    // RPC endpoints per network
    const rpcUrls = {
      bsc: 'https://bsc-dataseed.binance.org/',
      eth: 'https://rpc.ankr.com/eth',
      tron: 'https://api.trongrid.io' // For TRC20, separate handling needed
    };

    if (!rpcUrls[network]) {
      return res.status(400).json({ error: 'Unsupported network' });
    }

    const rpcUrl = rpcUrls[network];

    // Get latest block
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

    console.log(`[MONITOR] Latest block: ${latestBlock}`);

    // Check last 1500 blocks
    const startBlock = latestBlock - 1500;

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

      if (blockData.result && blockData.result.transactions) {
        for (const tx of blockData.result.transactions) {
          if (tx.to && tx.to.toLowerCase() === address.toLowerCase()) {
            const txValue = parseFloat(parseInt(tx.value, 16) / 1e18);

            // Allow ±0.50 USDT variance
            if (Math.abs(txValue - parsedAmount) <= 0.5) {
              console.log(`[MONITOR] Match found: TX ${tx.hash} Value: ${txValue}`);
              return res.status(200).json({
                status: 'confirmed',
                txHash: tx.hash,
                amount: txValue
              });
            }
          }
        }
      }
    }

    return res.status(200).json({ status: 'pending' });
  } catch (err) {
    console.error('[MONITOR] Error checking transaction:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
