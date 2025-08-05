import { ethers } from 'ethers';
import TronWeb from 'tronweb';

export async function createWallet(network) {
  const normalized = network.toLowerCase().replace('-', '');

  if (normalized === 'trc20') {
    // No external calls needed – safe in serverless!
    const account = TronWeb.utils.accounts.generateAccount();

    return {
      address: account.address.base58,
      privateKey: account.privateKey
    };
  } else {
    const wallet = ethers.Wallet.createRandom();

    return {
      address: wallet.address,
      privateKey: wallet.privateKey
    };
  }
}
