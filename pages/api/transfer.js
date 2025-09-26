import { ethers } from 'ethers';
import TronWeb from 'tronweb'; // <-- NEW: Import TronWeb
import { decrypt } from '../../lib/encryption';

// --- Constants ---
const ETH_RPC_URL = 'https://mainnet.infura.io/v3/9e2db22c015d4d4fbd3deefde96d3765';
const BSC_RPC_URL = 'https://bsc-dataseed.binance.org/';

// --- NEW: Add TRC-20 address ---
const USDT_ADDRESSES = {
  'ERC-20': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  'BEP-20': '0x55d398326f99059fF775485246999027B3197955',
  'TRC-20': 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
};
// ABI for EVM (ERC/BEP)
const EVM_USDT_ABI = [ "function transfer(address, uint256)", "function balanceOf(address) view returns (uint256)" ];
// ABI for TRON (is slightly different)
const TRON_USDT_ABI = [ "function transfer(address _to, uint256 _value)", "function balanceOf(address who) view returns (uint256)" ];

// --- NEW: Helper to normalize network names ---
const normalize = (s) => (s || '').toUpperCase().replace('-', '');

// --- NEW: TRON Setup ---
const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  // This is a dummy key, we will set the real one inside the handler
  privateKey: '01' 
});


export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { walletId, destinationAddress } = req.body;

    // --- Get Encrypted Key & Address from PHP ---
    const phpResponse = await fetch('https://axiomcommunity.co/templates/get_wallet_key.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': process.env.PHP_API_KEY
      },
      body: JSON.stringify({ walletId: walletId })
    });

    const phpData = await phpResponse.json();
    if (!phpData.success) {
      throw new Error(phpData.error || 'Failed to fetch wallet from PHP');
    }

    // --- NEW: We now get 'address' from the PHP file ---
    const { private_key: encryptedKey, network, address: userAddress } = phpData.data;
    const userWalletKey = decrypt(encryptedKey);
    const normalizedNetwork = normalize(network);


    // =================================================================
    // --- BRANCH 1: EVM LOGIC (ERC-20 / BEP-20) ---
    // =================================================================
    if (normalizedNetwork === 'ERC20' || normalizedNetwork === 'BEP20') {
      
      // 2. Setup Providers and Keys
      const sponsorWalletKey = process.env.SPONSOR_WALLET_KEY;
      
      // --- NEW: Correctly select the provider ---
      const provider = normalizedNetwork === 'ERC20' 
        ? new ethers.providers.JsonRpcProvider(ETH_RPC_URL)
        : new ethers.providers.JsonRpcProvider(BSC_RPC_URL);
      
      const sponsorWallet = new ethers.Wallet(sponsorWalletKey, provider);
      const userWallet = new ethers.Wallet(userWalletKey, provider);
      
      // 4. Define Contracts
      const usdtAddress = USDT_ADDRESSES[network]; // Use original network name for key
      const usdtContract = new ethers.Contract(usdtAddress, EVM_USDT_ABI, provider);

      // 5. Check Balance
      const balance = await usdtContract.balanceOf(userWallet.address);
      if (balance.isZero()) throw new Error('No balance to transfer');

      console.log(`Starting EVM 2-step transfer for wallet ${walletId}...`);
      
      // 6.A. Fund for Gas
      const gasPrice = await provider.getGasPrice();
      // Estimate gas: 21000 for base TX + 40000 for USDT transfer = ~61000
      const gasCost = gasPrice.mul(65000); 
      
      console.log(`Sending ${ethers.utils.formatEther(gasCost)} gas to ${userWallet.address}`);
      const fundTx = await sponsorWallet.sendTransaction({
        to: userWallet.address,
        value: gasCost
      });
      await fundTx.wait();
      console.log(`Gas sent: ${fundTx.hash}`);

      // 6.B. Send the USDT
      console.log(`Sending ${ethers.utils.formatUnits(balance, 6)} USDT...`);
      const transferTx = await usdtContract.connect(userWallet).transfer(destinationAddress, balance);
      await transferTx.wait();
      console.log(`USDT sent: ${transferTx.hash}`);

      res.status(200).json({ success: true, gasTx: fundTx.hash, transferTx: transferTx.hash });
    } 
    
    // =================================================================
    // --- BRANCH 2: TRON LOGIC (TRC-20) ---
    // =================================================================
    else if (normalizedNetwork === 'TRC20') {
      
      const tronSponsorKey = process.env.TRON_SPONSOR_KEY;
      if (!tronSponsorKey) throw new Error('TRON_SPONSOR_KEY is not set');

      // 3. Define Contracts
      const usdtAddress = USDT_ADDRESSES['TRC-20'];
      const usdtContract = await tronWeb.contract(TRON_USDT_ABI, usdtAddress);

      // 4. Check Balance
      const balance = await usdtContract.balanceOf(userAddress).call();
      if (balance.isZero()) throw new Error('No balance to transfer');

      console.log(`Starting TRON 2-step transfer for wallet ${walletId}...`);

      // 5.A. Fund for Gas (Send TRX)
      // We need to send TRX to cover the 'Energy' cost, ~15-30 TRX
      const gasAmountTrx = 30;
      const gasAmountSun = tronWeb.toSun(gasAmountTrx);
      
      tronWeb.setPrivateKey(tronSponsorKey); // Set context to sponsor
      console.log(`Sending ${gasAmountTrx} TRX gas to ${userAddress}`);
      
      const fundTx = await tronWeb.trx.sendTransaction(userAddress, gasAmountSun);
      if (!fundTx.result) throw new Error('Failed to send TRX gas');
      console.log(`Gas sent: ${fundTx.txid}`);
      
      // Wait for the TRX to arrive. 
      // This is a simple (but not perfect) 15-second wait.
      await new Promise(resolve => setTimeout(resolve, 15000)); 
      
      // 5.B. Send the USDT
      tronWeb.setPrivateKey(userWalletKey); // Set context to user
      console.log(`Sending ${ethers.utils.formatUnits(balance.toString(), 6)} USDT...`);

      // We send the *full balance*
      const transferTxId = await usdtContract.transfer(destinationAddress, balance).send({
        feeLimit: tronWeb.toSun(20) // Set a 20 TRX fee limit
      });
      console.log(`USDT sent: ${transferTxId}`);

      res.status(200).json({ success: true, gasTx: fundTx.txid, transferTx: transferTxId });
    }
    
    // =================================================================
    // --- BRANCH 3: UNSUPPORTED ---
    // =================================================================
    else {
      throw new Error(`Unsupported network: ${network}`);
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}