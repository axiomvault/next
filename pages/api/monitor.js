const { checkTransactionStatus } = require('../../lib/monitor');

export default async function handler(req, res) {
  try {
    // ✅ CORS headers
    // More secure for production
    res.setHeader('Access-Control-Allow-Origin', 'https://axiomcommunity.co');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Ensure we always return JSON
    res.setHeader('Content-Type', 'application/json');

    // Handle OPTIONS request
    if (req.method === 'OPTIONS') {
      return res.status(200).json({});
    }

    // Only allow GET requests
    if (req.method !== 'GET') {
      return res.status(405).json({ 
        error: 'Method Not Allowed',
        allowedMethods: ['GET']
      });
    }

    const { address, amount, network } = req.query;

    // Basic validation
    if (!address || !amount || !network) {
      return res.status(400).json({
        error: 'Missing parameters',
        required: ['address', 'amount', 'network']
      });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        error: 'Invalid amount',
        message: 'Amount must be a positive number'
      });
    }

    // Check transaction status
    const result = await checkTransactionStatus(
      network.toLowerCase(), 
      address, 
      parsedAmount
    );

    // Successful response
    return res.status(200).json({
      status: result.confirmed ? 'confirmed' : 'pending',
      address,
      amount: parsedAmount,
      network,
      ...(result.confirmed && { receivedAmount: result.debug.balance }),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Monitor Error:', error);
    
    // Proper error response
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
      ...(process.env.NODE_ENV === 'development' && {
        stack: error.stack
      })
    });
  }
}