import { ethers } from 'ethers';
import TronWeb from 'tronweb';
import { decrypt } from '../../lib/encryption';

// --- Constants (No change) ---
const ETH_RPC_URL = 'https://mainnet.infura.io/v3/9e2db22c015d4d4fbd3deefde96d3765';
const BSC_RPC_URL = 'https://bsc-dataseed.binance.org/';
const USDT_ADDRESSES = {
  'ERC-20': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  'BEP-20': '0x55d398326f99059fF775485246999027B3197955',
  'TRC-20': 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
};
const EVM_USDT_ABI = [ "function transfer(address, uint256)", "function balanceOf(address) view returns (uint256)" ];
const TRON_USDT_ABI = [ "function transfer(address _to, uint256 _value)", "function balanceOf(address who) view returns (uint256)" ];
const normalize = (s) => (s || '').toUpperCase().replace('-', '');
const tronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io', privateKey: '01' });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { walletId, destinationAddress } = req.body;

    // --- Get Encrypted Key & Address from PHP (No change) ---
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
    // --- BRANCH 1: EVM LOGIC (ERC-20 / BEP-20) - UPGRADED ---
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
      
      // --- NEW STEP A: DYNAMIC GAS ESTIMATION ---
      const gasPrice = await provider.getGasPrice();
      // 1. Estimate gas needed for the USDT transfer
      const usdtTxGasLimit = await usdtContract.connect(userWallet).estimateGas.transfer(destinationAddress, balance);
      // 2. Estimate gas needed for the final "sweep" transaction (a standard transfer)
      const sweepTxGasLimit = ethers.BigNumber.from(21000); 
      // 3. Calculate total cost with a 10% buffer for safety
      const totalGasLimit = usdtTxGasLimit.add(sweepTxGasLimit);
      const gasCostToSend = totalGasLimit.mul(gasPrice).mul(110).div(100); // Cost + 10% buffer
      
      // --- STEP B: FUND FOR GAS ---
      console.log(`Funding wallet with exactly ${ethers.utils.formatEther(gasCostToSend)} native coin for gas...`);
      const fundTx = await sponsorWallet.sendTransaction({
        to: userWallet.address,
        value: gasCostToSend
      });
      await fundTx.wait();
      console.log(`Gas funding successful: ${fundTx.hash}`);

      // --- STEP C: SEND THE USDT ---
      console.log(`Sending ${ethers.utils.formatUnits(balance, 6)} USDT...`);
      const transferTx = await usdtContract.connect(userWallet).transfer(destinationAddress, balance, {
        gasPrice: gasPrice, // Use the same gas price for predictability
        gasLimit: usdtTxGasLimit 
      });
      await transferTx.wait();
      console.log(`USDT transfer successful: ${transferTx.hash}`);

      // --- NEW STEP D: SWEEP LEFTOVER DUST ---
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
    // --- BRANCH 2: TRON LOGIC (TRC-20) - UNCHANGED ---
    // =================================================================
    else if (normalizedNetwork === 'TRC20') {
      // (The TRON logic remains the same, as its fee structure is more predictable 
      // and the leftover amount is negligible, making a sweep inefficient.)
      const tronSponsorKey = process.env.TRON_SPONSOR_KEY;
      if (!tronSponsorKey) throw new Error('TRON_SPONSOR_KEY is not set');

      const usdtContract = await tronWeb.contract(TRON_USDT_ABI, USDT_ADDRESSES['TRC-20']);
      const balance = await usdtContract.balanceOf(userAddress).call();
      if (balance.isZero()) throw new Error('No balance to transfer');

      console.log(`Starting TRON 2-step transfer for wallet ${walletId}...`);
      
      const gasAmountTrx = 30;
      tronWeb.setPrivateKey(tronSponsorKey);
      console.log(`Sending ${gasAmountTrx} TRX gas to ${userAddress}`);
      const fundTx = await tronWeb.trx.sendTransaction(userAddress, tronWeb.toSun(gasAmountTrx));
      if (!fundTx.result) throw new Error('Failed to send TRX gas');
      console.log(`Gas sent: ${fundTx.txid}`);
      
      await new Promise(resolve => setTimeout(resolve, 15000)); 
      
      tronWeb.setPrivateKey(userWalletKey);
      console.log(`Sending ${ethers.utils.formatUnits(balance.toString(), 6)} USDT...`);
      const transferTxId = await usdtContract.transfer(destinationAddress, balance).send({
        feeLimit: tronWeb.toSun(20)
      });
      console.log(`USDT sent: ${transferTxId}`);

      res.status(200).json({ success: true, gasTx: fundTx.txid, transferTx: transferTxId });
    }
    
    // ... (Unsupported network branch) ...
    else {
      throw new Error(`Unsupported network: ${network}`);
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}