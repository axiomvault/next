const { checkTransactionStatus } = require('../../lib/monitor');

export default async function handler(req, res) {
  // ✅ CORS headers (keep existing)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // ✅ Disable all caching (keep existing)
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.removeHeader?.('ETag');

  if (req.method === 'OPTIONS') {
    return res.status(200).end(); // Preflight check
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { address, amount, network } = req.query;

  // Simplified debug info (removed transaction-specific fields)
  let debugInfo = {
    step: 'start',
    params: { address, amount, network },
    provider: null,
    balance: null,
    requiredAmount: null,
    checkedAt: new Date().toISOString()
  };

  if (!address || !amount || !network) {
    return res.status(400).json({ 
      error: 'Missing parameters',
      debug: { ...debugInfo, reason: 'Missing address, amount or network' }
    });
  }

  try {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        error: 'Invalid amount',
        debug: { ...debugInfo, reason: `Invalid amount: ${amount}` }
      });
    }

    debugInfo.step = 'checking_balance';
    
    // ✅ Get balance check result
    const result = await checkTransactionStatus(network.toLowerCase(), address, parsedAmount);
    
    // Merge debug info
    debugInfo = { 
      ...debugInfo,
      ...result.debug,
      step: 'completed'
    };

    // Simplified response (no txHash needed now)
    return res.status(200).json({
      status: result.confirmed ? 'confirmed' : 'pending',
      debug: debugInfo,
      // Include balance info for debugging
      currentBalance: result.debug.balance,
      requiredAmount: parsedAmount
    });

  } catch (err) {
    return res.status(500).json({
      error: 'Internal Server Error',
      debug: {
        ...debugInfo,
        step: 'failed',
        reason: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
      }
    });
  }
}