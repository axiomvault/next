import { createWallet } from '../../lib/walletManager';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { user_id, network, plan_id, amount } = req.body;

    if (!user_id || !network || isNaN(plan_id) || isNaN(amount)) {
      return res.status(400).json({ error: 'Missing or invalid parameters' });
    }

    // 1. Create wallet
    const wallet = await createWallet(network);

    if (!wallet?.address || !wallet?.privateKey) {
      throw new Error('Wallet generation failed');
    }

    // 2. Save it to PHP backend
    const saveResponse = await fetch('https://c09.8c6.mytemp.website/save_wallet.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: wallet.address,
        private_key: wallet.privateKey,
        user_id,
        plan_id,
        amount,
        network
      })
    });

    const saveResult = await saveResponse.json();

    if (!saveResult.success) {
      throw new Error(saveResult.error || 'Failed to save wallet');
    }

    // 3. Return public address only
    return res.status(200).json({ success: true, address: wallet.address });

  } catch (err) {
    console.error('[walletManager.js ERROR]:', err);
    return res.status(500).json({ error: err.message });
  }
}
