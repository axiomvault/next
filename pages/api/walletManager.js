import { createWalletAndSave } from '../../lib/walletSaver.js';

export default async function handler(req, res) {
  // 🔒 Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*'); // You can restrict this to a domain later
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 🛑 Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    console.warn('[WARN] Invalid method:', req.method);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    console.log('[DEBUG] Incoming request body:', req.body);

    const { user_id, network, plan_id, amount } = req.body;

    // 🔍 Parameter validation
    if (!user_id || !network || isNaN(plan_id) || isNaN(amount)) {
      console.warn('[WARN] Missing or invalid parameters:', { user_id, network, plan_id, amount });
      return res.status(400).json({ error: 'Missing or invalid parameters' });
    }

    // 🧠 Attempt wallet creation and DB save
    const wallet = await createWalletAndSave(network, user_id, plan_id, amount);

    console.log('[✅ SUCCESS] Wallet created:', wallet);

    return res.status(200).json({
      success: true,
      address: wallet.address,
    });

  } catch (err) {
    console.error('[❌ ERROR] Wallet creation failed:', err);

    // ⚠️ Temporarily send full error stack (REMOVE IN PRODUCTION)
    return res.status(500).json({
      error: err.message,
      stack: err.stack,
    });
  }
}
