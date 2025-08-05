import { pool } from './db.js';
import { createWallet } from './walletManager.js';

const ensureTables = async () => {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS trc_wallet (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      address     VARCHAR(128)  NOT NULL UNIQUE,
      private_key TEXT          NOT NULL,
      user_id     VARCHAR(64)   NOT NULL,
      plan_id     INT           NOT NULL,
      amount      DECIMAL(18,8) NOT NULL,
      created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS erc_wallet (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      address     VARCHAR(128)  NOT NULL UNIQUE,
      private_key TEXT          NOT NULL,
      user_id     VARCHAR(64)   NOT NULL,
      plan_id     INT           NOT NULL,
      amount      DECIMAL(18,8) NOT NULL,
      created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

export const createWalletAndSave = async (network, user_id, plan_id, amount) => {
  await ensureTables();

  // Sanitize and validate input
  const uid = typeof user_id === 'string' ? user_id.trim() : String(user_id).trim();
  const pid = Number(plan_id);
  const amt = Number(amount);

  if (!uid || typeof uid !== 'string' || isNaN(pid) || isNaN(amt)) {
    throw new Error('Invalid or missing user_id, plan_id, or amount');
  }

  // Create the wallet using network
  const wallet = await createWallet(network);

  if (!wallet?.address || !wallet?.privateKey) {
    throw new Error('Wallet generation failed; empty address or key');
  }

  const table = network.toLowerCase().replace('-', '') === 'trc20'
    ? 'trc_wallet'
    : 'erc_wallet';

  // Insert wallet into appropriate table
  await pool.execute(
    `INSERT INTO ${table} (address, private_key, user_id, plan_id, amount)
     VALUES (?, ?, ?, ?, ?)`,
    [wallet.address, wallet.privateKey, uid, pid, amt]
  );

  return wallet;
};
