const { ethers } = require('ethers');

const usdtContracts = {
  erc20: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  bep20: '0x55d398326f99059fF775485246999027B3197955',
};

const rpcProviders = {
  erc20: [
    'https://mainnet.infura.io/v3/c62df08267f24d1993ae7c57ef5bc5cf',
    'https://rpc.ankr.com/eth/5c4533c0f82eb05973b9e3b824c0162c2f84044d57a5865b5a006209df5ad469',
  ],
  bep20: [
    'https://bsc.publicnode.com',
    'https://rpc.ankr.com/bsc/5c4533c0f82eb05973b9e3b824c0162c2f84044d57a5865b5a006209df5ad469',
  ],
};

function isEvmAddress(address) {
  try {
    return ethers.isAddress(address);
  } catch {
    return false;
  }
}

async function tryEvmProvider(providers, callback) {
  for (let url of providers) {
    try {
      console.log(`🌐 Trying RPC: ${url}`);
      const provider = new ethers.JsonRpcProvider(url);
      return await callback(provider, url);
    } catch (err) {
      console.warn(`⚠️ RPC failed: ${url}`, err.message);
    }
  }
  throw new Error('All RPC providers failed.');
}

async function checkTransactionStatus(network, address, amount) {
  const debug = {
    step: 'checking transaction',
    params: { network, address, amount },
    reason: '',
    seenTxs: [],
    requiredConfirmations: 12,
    currentConfirmations: 0
  };

  try {
    // 1️⃣ Fetch recent transactions
    const txList = await getTransactionsForAddress(network, address); // your existing function
    debug.seenTxs = txList.map(tx => tx.hash);

    // If no transactions at all
    if (!txList.length) {
      debug.reason = 'No transactions found for this address in recent blocks';
      return { confirmed: false, debug };
    }

    // 2️⃣ Look for a matching transaction
    const matchingTx = txList.find(tx =>
      tx.to?.toLowerCase() === address.toLowerCase() &&
      parseFloat(tx.amount) >= amount
    );

    if (!matchingTx) {
      debug.reason = 'No matching transaction found with required amount';
      return { confirmed: false, debug };
    }

    // 3️⃣ Check confirmations
    debug.currentConfirmations = matchingTx.confirmations || 0;
    if (debug.currentConfirmations < debug.requiredConfirmations) {
      debug.reason = `Transaction found but only ${debug.currentConfirmations} confirmations (need ${debug.requiredConfirmations})`;
      debug.txHash = matchingTx.hash;
      return { confirmed: false, debug };
    }

    // 4️⃣ If all good, confirm
    debug.reason = 'Transaction confirmed';
    return { confirmed: true, txHash: matchingTx.hash, debug };

  } catch (err) {
    debug.reason = `Error checking transaction: ${err.message}`;
    return { confirmed: false, debug };
  }
}


module.exports = {
  checkTransactionStatus,
};
