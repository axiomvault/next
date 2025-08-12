const { checkTransactionStatus } = require('../../lib/monitor');

export default async function handler(req, res) {
  // ===== STRICT NO-CACHE HEADERS =====
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  
  // ===== CORS CONFIG =====
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ 
      error: 'Method Not Allowed',
      allowed: ['GET', 'OPTIONS'] 
    });
  }

  // ===== PARAM VALIDATION =====
  const { address, amount, network } = req.query;
  const timestamp = Date.now();

  console.log(`[${timestamp}] Payment Check:`, { network, address, amount });

  if (!address || !amount || !network) {
    return res.status(400).json({
      status: 'error',
      error: 'Missing parameters',
      required: ['address', 'amount', 'network'],
      received: Object.keys(req.query)
    });
  }

  try {
    // ===== AMOUNT VALIDATION =====
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) {
      throw new Error(`Invalid amount: ${amount}. Must be a number`);
    }

    // ===== NETWORK VALIDATION =====
    const normalizedNetwork = network.toLowerCase();
    if (!['trc20', 'erc20', 'bep20'].includes(normalizedNetwork)) {
      throw new Error(`Unsupported network: ${network}`);
    }

    // ===== CACHE-BUSTED CHECK =====
    const result = await checkTransactionStatus(
      normalizedNetwork,
      address,
      parsedAmount,
      timestamp // Used as cache buster
    );

    // ===== SUCCESS RESPONSE =====
    return res.status(200).json({
      status: 'success',
      verified: result.confirmed,
      network: normalizedNetwork,
      address,
      amount: parsedAmount,
      timestamp,
      ...(result.confirmed && {
        txHash: result.txHash,
        confirmations: result.confirmations,
        blockNumber: result.blockNumber
      }),
      _cache: 'disabled'
    });

  } catch (err) {
    // ===== ERROR HANDLING =====
    console.error(`[${timestamp}] Verification Failed:`, err.message);
    return res.status(500).json({
      status: 'error',
      error: 'Payment verification failed',
      message: err.message,
      network,
      address,
      amount,
      timestamp,
      _retry: true
    });
  }
}