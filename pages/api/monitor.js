const { checkTransactionStatus } = require('../../lib/monitor');

export default async function handler(req, res) {
  // ✅ CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // ✅ Disable all caching
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  // Remove any ETag
  res.removeHeader?.('ETag');

  if (req.method === 'OPTIONS') {
    return res.status(200).end(); // Preflight check
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { address, amount, network } = req.query;

  let debugInfo = {
    step: 'start',
    params: { address, amount, network },
    reason: '',
    seenTxs: [],
    requiredConfirmations: 12,
    currentConfirmations: 0
  };

  if (!address || !amount || !network) {
    debugInfo.reason = 'Missing parameters';
    return res.status(400).json({ error: 'Missing parameters', debug: debugInfo });
  }

  try {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount)) {
      debugInfo.reason = `Invalid amount format: ${amount}`;
      return res.status(400).json({ error: 'Invalid amount', debug: debugInfo });
    }

    debugInfo.step = 'checking transaction';

    // ✅ Get result from monitor with extended debug
    const result = await checkTransactionStatus(network.toLowerCase(), address, parsedAmount);

    // Merge debug info
    debugInfo = { ...debugInfo, ...result.debug };

    if (result.confirmed) {
      return res.status(200).json({
        status: 'confirmed',
        txHash: result.txHash,
        debug: debugInfo
      });
    } else {
      return res.status(200).json({
        status: 'pending',
        debug: debugInfo
      });
    }
  } catch (err) {
    debugInfo.reason = `Error checking transaction: ${err.message}`;
    return res.status(500).json({ error: 'Internal Server Error', debug: debugInfo });
  }
}
