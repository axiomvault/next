const { checkTransactionStatus } = require('../../lib/monitor');
const crypto = require('crypto');

export default async function handler(req, res) {
  // ===== NUCLEAR CACHE DISABLE =====
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('Vary', '*');
  
  // ===== FORCE UNIQUE RESPONSE =====
  const responseId = crypto.randomUUID();
  res.setHeader('X-Response-ID', responseId);
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Request-ID');

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
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new Error(`Invalid amount: ${amount}. Must be positive number`);
    }

    // ===== NETWORK VALIDATION =====
    const normalizedNetwork = network.toLowerCase();
    if (!['trc20', 'erc20', 'bep20'].includes(normalizedNetwork)) {
      throw new Error(`Unsupported network: ${network}`);
    }

    // ===== FORCE FRESH CHECK =====
    const result = await checkTransactionStatus(
      normalizedNetwork,
      address,
      parsedAmount,
      timestamp // Used as cache buster
    );

    // ===== SUCCESS RESPONSE =====
    return res.status(200).json({
      status: result.confirmed ? 'confirmed' : 'pending',
      network: normalizedNetwork,
      address,
      amount: parsedAmount,
      ...(result.confirmed && {
        txHash: result.txHash,
        confirmations: result.confirmations,
        timestamp: result.timestamp
      }),
      _metadata: {
        responseId,
        timestamp,
        checksum: crypto.createHash('md5')
          .update(`${responseId}-${timestamp}-${Math.random()}`)
          .digest('hex')
      }
    });

  } catch (err) {
    // ===== ERROR HANDLING =====
    console.error(`[${new Date().toISOString()}] Error:`, err.message);
    return res.status(500).json({
      status: 'error',
      error: err.message,
      _retry: {
        cacheBuster: `_t=${Date.now()}`,
        recommended: true
      }
    });
  }
}