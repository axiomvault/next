import { useState, useEffect, useMemo } from 'react';
import { ethers } from 'ethers';
import TronWeb from 'tronweb';

// --- Constants (Fill in your details) ---
const ETH_RPC_URL = 'https://mainnet.infura.io/v3/YOUR_INFURA_API_KEY';
const BSC_RPC_URL = 'https://bsc-dataseed.binance.org/';
const API_BASE_URL = 'https://axiomcommunity.co/templates';

const USDT_ABI = [ "function balanceOf(address) view returns (uint2s56)" ];
const USDT_ADDRESSES = {
  'ERC-20': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  'BEP-20': '0x55d398326f99059fF775485246999027B3197955',
  'TRC-20': 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
};

// --- Blockchain Providers ---
const ethProvider = new ethers.providers.JsonRpcProvider(ETH_RPC_URL);
const bscProvider = new ethers.providers.JsonRpcProvider(BSC_RPC_URL);
const tronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io' });

// --- Helper Components ---
const StatCard = ({ title, value, loading = false }) => (
  <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
    <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">{title}</h3>
    {loading ? (
      <div className="h-8 w-24 bg-gray-700 rounded animate-pulse mt-1"></div>
    ) : (
      <p className="text-3xl font-semibold text-white mt-1">{value}</p>
    )}
  </div>
);

const CopyButton = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button onClick={copy} className="ml-2 text-gray-400 hover:text-white" title="Copy to clipboard">
      {copied ? (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
      )}
    </button>
  );
};

// --- Main Dashboard Component ---
export default function Dashboard() {
  const [wallets, setWallets] = useState([]);
  const [balances, setBalances] = useState({}); // { 1: '10.00', 2: 'Error' }
  const [loading, setLoading] = useState(true);
  const [transferring, setTransferring] = useState(null); // stores the ID of the wallet being transferred
  const [networkFilter, setNetworkFilter] = useState('all');
  const [destinationAddresses, setDestinationAddresses] = useState({}); // { 1: '0x...', 2: '0x...' }

  // --- Data Fetching ---
  const fetchAllWallets = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/get_wallets.php`);
      const data = await res.json();
      if (data.success) {
        setWallets(data.wallets);
        fetchBalances(data.wallets); // Fetch balances *after* wallets are set
      }
    } catch (e) {
      console.error("Failed to fetch wallets", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchBalances = async (walletsToFetch) => {
    const balancePromises = walletsToFetch.map(async (wallet) => {
      try {
        const usdtAddress = USDT_ADDRESSES[wallet.network];
        let balanceBN;

        if (wallet.network === 'ERC-20') {
          const contract = new ethers.Contract(usdtAddress, USDT_ABI, ethProvider);
          balanceBN = await contract.balanceOf(wallet.address);
        } else if (wallet.network === 'BEP-20') {
          const contract = new ethers.Contract(usdtAddress, USDT_ABI, bscProvider);
          balanceBN = await contract.balanceOf(wallet.address);
        } else if (wallet.network === 'TRC-20') {
          const contract = await tronWeb.contract().at(usdtAddress);
          balanceBN = await contract.balanceOf(wallet.address).call();
        }
        // USDT has 6 decimals
        return { id: wallet.id, balance: ethers.utils.formatUnits(balanceBN || 0, 6) };
      } catch (e) {
        return { id: wallet.id, balance: 'Error' };
      }
    });

    const results = await Promise.all(balancePromises);
    
    // Convert array of {id, balance} to a balance map {id: balance}
    const balanceMap = results.reduce((acc, curr) => {
      acc[curr.id] = curr.balance;
      return acc;
    }, {});

    setBalances(balanceMap);
  };

  useEffect(() => {
    fetchAllWallets();
  }, []);

  // --- State Computations (Memoized) ---
  const filteredWallets = useMemo(() => {
    if (networkFilter === 'all') return wallets;
    return wallets.filter(w => w.network === networkFilter);
  }, [wallets, networkFilter]);

  const stats = useMemo(() => {
    const erc = wallets.filter(w => w.network === 'ERC-20').length;
    const bep = wallets.filter(w => w.network === 'BEP-20').length;
    const trc = wallets.filter(w => w.network === 'TRC-20').length;
    
    const totalBalance = Object.values(balances).reduce((acc, bal) => {
      const numBal = parseFloat(bal);
      return isNaN(numBal) ? acc : acc + numBal;
    }, 0);

    return {
      total: wallets.length,
      erc,
      bep,
      trc,
      totalBalance: totalBalance.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    };
  }, [wallets, balances]);

  // --- Event Handlers ---
  const handleAddressChange = (walletId, value) => {
    setDestinationAddresses(prev => ({
      ...prev,
      [walletId]: value
    }));
  };

  const handleTransfer = async (walletId) => {
    const destinationAddress = destinationAddresses[walletId];
    if (!destinationAddress) {
      alert("Please enter a destination address for this wallet.");
      return;
    }

    setTransferring(walletId);
    try {
      const res = await fetch('/api/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletId: walletId,
          destinationAddress: destinationAddress
        })
      });

      const data = await res.json();
      if (data.success) {
        alert(`Transfer successful!\nGas Tx: ${data.gasTx}\nTransfer Tx: ${data.transferTx}`);
        // Clear the input field and refresh balances
        setDestinationAddresses(prev => ({ ...prev, [walletId]: '' }));
        fetchAllWallets(); // Refresh all data
      } else {
        throw new Error(data.error || 'Transfer failed');
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setTransferring(null);
    }
  };


  // --- JSX ---
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 md:p-8">
      <h1 className="text-4xl font-bold mb-8">Wallet Dashboard</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard title="Total Wallets" value={stats.total} loading={loading} />
        <StatCard title="Total Balance" value={stats.totalBalance} loading={loading && !stats.total} />
        <StatCard title="ERC-20 Wallets" value={stats.erc} loading={loading} />
        <StatCard title="BEP-20 Wallets" value={stats.bep} loading={loading} />
        <StatCard title="TRC-20 Wallets" value={stats.trc} loading={loading} />
      </div>

      {/* Controls */}
      <div className="flex justify-between items-center mb-4 bg-gray-800 p-4 rounded-lg shadow">
        <div>
          <label htmlFor="network-filter" className="text-sm font-medium text-gray-300 mr-2">Filter by Network:</label>
          <select 
            id="network-filter"
            className="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={networkFilter}
            onChange={(e) => setNetworkFilter(e.target.value)}
          >
            <option value="all">All Networks</option>
            <option value="ERC-20">ERC-20 (Ethereum)</option>
            <option value="BEP-20">BEP-20 (BSC)</option>
            <option value="TRC-20">TRC-20 (TRON)</option>
          </select>
        </div>
        <button
          onClick={fetchAllWallets}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh All'}
        </button>
      </div>

      {/* Wallets Table */}
      <div className="bg-gray-800 shadow-lg rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Address</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Network</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Balance (USDT)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Destination Address</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {loading && wallets.length === 0 ? (
                <tr><td colSpan="5" className="text-center py-8 text-gray-400">Loading wallets...</td></tr>
              ) : filteredWallets.length === 0 ? (
                <tr><td colSpan="5" className="text-center py-8 text-gray-400">No wallets found for this filter.</td></tr>
              ) : (
                filteredWallets.map((wallet) => (
                  <tr key={wallet.id} className="hover:bg-gray-700">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <span className="font-mono text-sm" title={wallet.address}>
                          {`${wallet.address.substring(0, 6)}...${wallet.address.substring(wallet.address.length - 4)}`}
                        </span>
                        <CopyButton text={wallet.address} />
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        wallet.network === 'ERC-20' ? 'bg-blue-200 text-blue-800' :
                        wallet.network === 'BEP-20' ? 'bg-yellow-200 text-yellow-800' :
                        'bg-red-200 text-red-800'
                      }`}>
                        {wallet.network}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {balances[wallet.id] === undefined ? (
                        <span className="text-xs text-gray-400">Loading...</span>
                      ) : balances[wallet.id] === 'Error' ? (
                        <span className="text-xs text-red-400">Error</span>
                      ) : (
                        <span className="font-medium">{parseFloat(balances[wallet.id]).toFixed(2)}</span>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <input 
                        type="text"
                        placeholder="0x..."
                        className="w-full bg-gray-600 border border-gray-500 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={destinationAddresses[wallet.id] || ''}
                        onChange={(e) => handleAddressChange(wallet.id, e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleTransfer(wallet.id)}
                        disabled={transferring === wallet.id || !destinationAddresses[wallet.id]}
                        className={`px-3 py-1 rounded-md text-white font-semibold text-xs ${
                          transferring === wallet.id ? 'bg-gray-500' : 
                          !destinationAddresses[wallet.id] ? 'bg-gray-600 opacity-50 cursor-not-allowed' :
                          'bg-green-600 hover:bg-green-700'
                        }`}
                      >
                        {transferring === wallet.id ? 'Sending...' : 'Send'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}