import { createWallet } from '../../lib/walletManager';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end(); // Handle CORS preflight
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { user_id, network, plan_id, amount } = req.body;

  if (!user_id || !network || !plan_id || !amount) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    const wallet = await createWallet(network);
    res.status(200).json({
      success: true,
      address: wallet.address,
      privateKey: wallet.privateKey
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
}
