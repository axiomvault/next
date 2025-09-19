import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import TronWeb from 'tronweb';

// --- Add these constants ---
// You MUST get an API key from a provider like Infura or Alchemy
const ETH_RPC_URL = 'https://mainnet.infura.io/v3/9e2db22c015d4d4fbd3deefde96d3765';
const BSC_RPC_URL = 'https://bsc-dataseed.binance.org/';

const USDT_ABI = [ "function balanceOf(address) view returns (uint256)" ];
const USDT_ADDRESSES = {
  'ERC-20': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  'BEP-20': '0x55d398326f99059fF775485246999027B3197955',
  'TRC-20': 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
};

// --- Providers ---
const ethProvider = new ethers.providers.JsonRpcProvider(ETH_RPC_URL);
const bscProvider = new ethers.providers.JsonRpcProvider(BSC_RPC_URL);
const tronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io' });

export default function Dashboard() {
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);

  async function fetchBalances(walletsFromApi) {
    const walletsWithBalances = await Promise.all(
      walletsFromApi.map(async (wallet) => {
        let balance = '0';
        try {
          const usdtAddress = USDT_ADDRESSES[wallet.network];
          if (wallet.network === 'ERC-20') {
            const contract = new ethers.Contract(usdtAddress, USDT_ABI, ethProvider);
            balance = await contract.balanceOf(wallet.address);
          } else if (wallet.network === 'BEP-20') {
            const contract = new ethers.Contract(usdtAddress, USDT_ABI, bscProvider);
            balance = await contract.balanceOf(wallet.address);
          } else if (wallet.network === 'TRC-20') {
            const contract = await tronWeb.contract().at(usdtAddress);
            balance = await contract.balanceOf(wallet.address).call();
          }
          
          // USDT has 6 decimals (usually)
          return { ...wallet, balance: ethers.utils.formatUnits(balance, 6) };
        } catch (e) {
          return { ...wallet, balance: 'Error' };
        }
      })
    );
    setWallets(walletsWithBalances);
    setLoading(false);
  }

  useEffect(() => {
    async function getWallets() {
      try {
        const res = await fetch('https://axiomcommunity.co/templates/get_wallets.php');
        const data = await res.json();
        if (data.success) {
          await fetchBalances(data.wallets);
        }
      } catch (e) {
        setLoading(false);
      }
    }
    getWallets();
  }, []);

  if (loading) return <div>Loading Wallets...</div>;

  return (
    <div>
      <h1>Wallet Dashboard</h1>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Address</th>
            <th>Network</th>
            <th>User ID</th>
            <th>USDT Balance</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {wallets.map((wallet) => (
            <tr key={wallet.id}>
              <td>{wallet.id}</td>
              <td>{wallet.address}</td>
              <td>{wallet.network}</td>
              <td>{wallet.user_id}</td>
              <td>{wallet.balance}</td>
              <td>
                <button>Transfer</button> {/* This button does nothing yet */}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}