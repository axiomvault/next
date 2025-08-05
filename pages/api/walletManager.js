import { createWalletAndSave } from '../../lib/walletSaver.js';

export default async function handler(req, res) {
  // ✅ Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*'); // <-- Allow all domains (or specify yours)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // ✅ Preflight request handling
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { user_id, network, plan_id, amount } = req.body;

    if (!user_id || !network || isNaN(plan_id) || isNaN(amount)) {
      return res.status(400).json({ error: 'Missing or invalid parameters' });
    }

    const wallet = await createWalletAndSave(network, user_id, plan_id, amount);

    return res.status(200).json({
      success: true,
      address: wallet.address,
    });

  } catch (err) {
    console.error('[API ERROR] Wallet creation failed:', err.message);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
