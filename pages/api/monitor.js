const { checkTransactionStatus } = require('../../lib/monitor');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { address, amount, network } = req.query;
  if (!address || !amount || !network) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount)) {
      throw new Error(`Invalid amount format: ${amount}`);
    }

    const result = await checkTransactionStatus(network.toLowerCase(), address, parsedAmount);

    if (result.confirmed) {
      return res.status(200).json({ status: 'confirmed', txHash: result.txHash });
    } else {
      return res.status(200).json({ status: 'pending' });
    }
  } catch (err) {
    console.error('[MONITOR ERROR]', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
