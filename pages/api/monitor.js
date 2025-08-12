const { checkTransactionStatus } = require('../../lib/monitor'); // Adjust path as needed

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end(); // Preflight check
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { address, amount, network } = req.query;

  console.log('[MONITOR] Query received:', { address, amount, network });

  if (!address || !amount || !network) {
    console.error('[MONITOR] Missing parameters:', { address, amount, network });
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount)) {
      throw new Error(`Invalid amount format: ${amount}`);
    }

    const result = await checkTransactionStatus(network.toLowerCase(), address, parsedAmount);

    console.log('[MONITOR] Result:', result);

    if (result.confirmed) {
      return res.status(200).json({ status: 'confirmed', txHash: result.txHash });
    } else {
      return res.status(200).json({ status: 'pending' });
    }
  } catch (err) {
    console.error('[MONITOR] Error checking transaction:', err.stack || err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

