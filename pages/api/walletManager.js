import { createWallet } from '../../lib/walletManager.js';

export default async function handler(req, res) {
  console.log("METHOD:", req.method);
  console.log("BODY:", req.body);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    console.error("Invalid method");
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { user_id, network, plan_id, amount } = req.body;
    console.log("PARAMS:", { user_id, network, plan_id, amount });

    if (!user_id || !network || !plan_id || !amount) {
      console.error("Missing params");
      return res.status(400).json({ error: 'Missing parameters' });
    }

    const wallet = await createWallet(network);
    console.log("WALLET:", wallet);

    return res.status(200).json({
      success: true,
      address: wallet.address,
      privateKey: wallet.privateKey
    });
  } catch (error) {
    console.error("ERROR:", error);
    return res.status(500).json({ error: 'Server error' });
  }
}
