const { checkTransactionStatus } = require('../../lib/monitor'); // Adjust path as needed

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end(); // Handle preflight
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { address, amount, network } = req.query;

  if (!address || !amount || !network) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    const result = await checkTransactionStatus(network.toLowerCase(), address, Number(amount));
    if (result.confirmed) {
      return res.status(200).json({ status: 'confirmed', txHash: result.txHash });
    } else {
      return res.status(200).json({ status: 'pending' });
    }
  } catch (err) {
    console.error('Error checking transaction:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
