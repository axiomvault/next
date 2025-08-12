const { checkTransactionStatus } = require('../../lib/monitor');
const crypto = require('crypto');

export default async function handler(req, res) {
  // ===== NUCLEAR CACHE DISABLE =====
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  
  // ===== COMPLETE CORS SOLUTION =====
  const allowedOrigins = [
    'https://axiomcommunity.co',
    'https://next-e2by-git-main-axioms-projects-da71f8d9.vercel.app'
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // ===== AUTHENTICATION =====
  const authToken = req.headers.authorization;
  if (!authToken || authToken !== `Bearer ${process.env.API_SECRET}`) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Valid API token required'
    });
  }

  // ===== MAIN REQUEST HANDLING =====
  try {
    const { address, amount, network } = req.query;
    const timestamp = Date.now();

    if (!address || !amount || !network) {
      return res.status(400).json({
        error: 'Missing parameters',
        required: ['address', 'amount', 'network']
      });
    }

    const result = await checkTransactionStatus(
      network.toLowerCase(),
      address,
      parseFloat(amount),
      timestamp
    );

    return res.status(200).json({
      status: result.confirmed ? 'confirmed' : 'pending',
      ...(result.confirmed && {
        txHash: result.txHash,
        confirmations: result.confirmations
      }),
      _cache: 'disabled',
      _timestamp: timestamp
    });

  } catch (err) {
    console.error('Monitor Error:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      details: err.message
    });
  }
}