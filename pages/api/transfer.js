import { ethers } from 'ethers';
import TronWeb from 'tronweb';
import { decrypt } from '../../lib/encryption';

// --- Constants ---
const ETH_RPC_URL = 'https://mainnet.infura.io/v3/9e2db22c015d4d4fbd3deefde96d3765';
const BSC_RPC_URL = 'https://bsc-dataseed.binance.org/';
const TRONGRID_API_KEY = '9556b28e-c17a-4ad2-a62c-102111131c5a'; // Using one of your keys

const USDT_ADDRESSES = {
  'ERC-20': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  'BEP-20': '0x55d398326f99059fF775485246999027B3197955',
  'TRC-20': 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
};
const EVM_USDT_ABI = [ "function transfer(address, uint256)", "function balanceOf(address) view returns (uint256)" ];
const TRON_USDT_ABI = [ "function transfer(address _to, uint256 _value)", "function balanceOf(address who) view returns (uint256)" ];
const normalize = (s) => (s || '').toUpperCase().replace('-', '');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { walletId, destinationAddress } = req.body;

    const phpResponse = await fetch('https://axiomcommunity.co/templates/get_wallet_key.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': process.env.PHP_API_KEY },
      body: JSON.stringify({ walletId: walletId })
    });
    const phpData = await phpResponse.json();
    if (!phpData.success) {
      throw new Error(phpData.error || 'Failed to fetch wallet from PHP');
    }
    const { private_key: encryptedKey, network, address: userAddress } = phpData.data;
    const userWalletKey = decrypt(encryptedKey);
    const normalizedNetwork = normalize(network);

    // =================================================================
    // --- BRANCH 1: EVM LOGIC (ERC-20 / BEP-20) ---
    // =================================================================
    if (normalizedNetwork === 'ERC20' || normalizedNetwork === 'BEP20') {
      const provider = normalizedNetwork === 'ERC20' 
        ? new ethers.providers.JsonRpcProvider(ETH_RPC_URL)
        : new ethers.providers.JsonRpcProvider(BSC_RPC_URL);
      
      const sponsorWallet = new ethers.Wallet(process.env.SPONSOR_WALLET_KEY, provider);
      const userWallet = new ethers.Wallet(userWalletKey, provider);
      
      const usdtAddress = USDT_ADDRESSES[network];
      const usdtContract = new ethers.Contract(usdtAddress, EVM_USDT_ABI, provider);

      const balance = await usdtContract.balanceOf(userWallet.address);
      if (balance.isZero()) throw new Error('No balance to transfer');

      console.log(`Starting EVM 3-step transfer for wallet ${walletId}...`);
      
      const gasPrice = await provider.getGasPrice();
      const usdtTxGasLimit = await usdtContract.connect(userWallet).estimateGas.transfer(destinationAddress, balance);
      const sweepTxGasLimit = ethers.BigNumber.from(21000); 
      const totalGasLimit = usdtTxGasLimit.add(sweepTxGasLimit);
      const gasCostToSend = totalGasLimit.mul(gasPrice).mul(110).div(100);
      
      console.log(`Funding wallet with ${ethers.utils.formatEther(gasCostToSend)} native coin for gas...`);
      const fundTx = await sponsorWallet.sendTransaction({
        to: userWallet.address,
        value: gasCostToSend
      });
      await fundTx.wait();
      console.log(`Gas funding successful: ${fundTx.hash}`);

      console.log(`Sending ${ethers.utils.formatUnits(balance, 6)} USDT...`);
      const transferTx = await usdtContract.connect(userWallet).transfer(destinationAddress, balance, {
        gasPrice: gasPrice,
        gasLimit: usdtTxGasLimit 
      });
      await transferTx.wait();
      console.log(`USDT transfer successful: ${transferTx.hash}`);

      console.log('Sweeping remaining gas back to sponsor wallet...');
      const remainingBalance = await provider.getBalance(userWallet.address);
      const sweepGasPrice = await provider.getGasPrice();
      const sweepFee = sweepGasPrice.mul(sweepTxGasLimit);

      if (remainingBalance.gt(sweepFee)) {
        const amountToSweep = remainingBalance.sub(sweepFee);
        const sweepTx = await userWallet.sendTransaction({
          to: sponsorWallet.address,
          value: amountToSweep,
          gasPrice: sweepGasPrice,
          gasLimit: sweepTxGasLimit
        });
        await sweepTx.wait();
        console.log(`Sweep successful: ${sweepTx.hash}`);
      } else {
        console.log('Not enough funds for sweep transaction, skipping.');
      }

      res.status(200).json({ success: true, gasTx: fundTx.hash, transferTx: transferTx.hash });
    } 
    
    // =================================================================
    // --- BRANCH 2: TRON LOGIC (TRC-20) - REWRITTEN FOR STABILITY ---
    // =================================================================
    else if (normalizedNetwork === 'TRC20') {
      
      const tronSponsorKey = process.env.TRON_SPONSOR_KEY;
      if (!tronSponsorKey) throw new Error('TRON_SPONSOR_KEY is not set');

      // --- Create a dedicated, safe instance for the user wallet ---
      const userTronWeb = new TronWeb({
        fullHost: 'https://api.trongrid.io',
        privateKey: userWalletKey,
        headers: { "TRON-PRO-API-KEY": TRONGRID_API_KEY }
      });

      const usdtAddress = USDT_ADDRESSES['TRC-20'];
      const usdtContract = await userTronWeb.contract(TRON_USDT_ABI, usdtAddress);

      const balance = await usdtContract.balanceOf(userAddress).call();
      if (balance.isZero()) throw new Error('No balance to transfer');

      console.log(`Starting TRON 2-step transfer for wallet ${walletId}...`);

      // --- Create a dedicated, safe instance for the sponsor wallet ---
      const sponsorTronWeb = new TronWeb({
        fullHost: 'https://api.trongrid.io',
        privateKey: tronSponsorKey,
        headers: { "TRON-PRO-API-KEY": TRONGRID_API_KEY }
      });
      
      const gasAmountTrx = 30; // 30 TRX is a safe amount for gas
      console.log(`Sending ${gasAmountTrx} TRX gas to ${userAddress}`);
      
      // Use the sponsor instance to send TRX
      const fundTx = await sponsorTronWeb.trx.sendTransaction(userAddress, sponsorTronWeb.toSun(gasAmountTrx));
      if (!fundTx || !fundTx.txid) {
          throw new Error('Failed to broadcast TRX gas funding transaction');
      }
      console.log(`Gas sent: ${fundTx.txid}`);
      
      // Wait for the TRX to arrive (15 seconds is a safe delay)
      await new Promise(resolve => setTimeout(resolve, 15000)); 
      
      console.log(`Sending ${ethers.utils.formatUnits(balance.toString(), 6)} USDT...`);
      // The usdtContract is already linked to the user's key, so it will sign correctly
      const transferTxId = await usdtContract.transfer(destinationAddress, balance).send({
        feeLimit: userTronWeb.toSun(20) // Set a 20 TRX fee limit
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
    // Log the full error to Vercel for debugging
    console.error('[TRANSFER API ERROR]:', err);
    res.status(500).json({ error: err.message });
  }
}