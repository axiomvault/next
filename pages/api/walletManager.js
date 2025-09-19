import { createWallet } from '../../lib/walletManager';
import { encrypt } from '../../lib/encryption'; // <--- IMPORT THIS

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://axiomcommunity.co');
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

    // 2. Encrypt the private key
    const encryptedKey = encrypt(wallet.privateKey); // <--- ENCRYPT HERE

    // 3. Save it to PHP backend
    const formData = new URLSearchParams();
    formData.append('address', wallet.address);
    formData.append('private_key', encryptedKey); // <--- SEND ENCRYPTED KEY
    formData.append('user_id', user_id);
    formData.append('plan_id', plan_id);
    formData.append('amount', amount);
    formData.append('network', network); // <-- Send the raw network name

    const saveResponse = await fetch('https://axiomcommunity.co/templates/save_wallet.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString()
    });

    const saveResult = await saveResponse.json();

    if (!saveResult.success) {
      throw new Error(saveResult.error || 'Failed to save wallet');
    }

    return res.status(200).json({ success: true, address: wallet.address });

  } catch (err) {
    console.error('[walletManager.js ERROR]:', err);
    return res.status(500).json({ error: err.message });
  }
}