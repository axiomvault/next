import { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { ethers } from 'ethers';
import TronWeb from 'tronweb';
import styles from './Dashboard.module.css'; // <-- IMPORT THE CSS FILE

// --- Constants (Fill in your details) ---
const ETH_RPC_URL = 'https://mainnet.infura.io/v3/9e2db22c015d4d4fbd3deefde96d3765';
const BSC_RPC_URL = 'https://bsc-dataseed.binance.org/';
const API_BASE_URL = 'https://axiomcommunity.co/templates';

const TOKEN_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)" 
];
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
  <div className={styles.statCard}>
    <h3 className={styles.statCardTitle}>{title}</h3>
    {loading ? (
      <div style={{height: '2rem', width: '6rem', backgroundColor: '#374151', borderRadius: '0.25rem', marginTop: '0.25rem'}}></div>
    ) : (
      <p className={styles.statCardValue}>{value}</p>
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
    <button onClick={copy} title="Copy to clipboard">
      {copied ? (
        <svg xmlns="http://www.w3.org/2000/svg" style={{height: '1rem', width: '1rem'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" style={{height: '1rem', width: '1rem'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
      )}
    </button>
  );
};

// --- Main Dashboard Component ---
export default function Dashboard() {
  const [wallets, setWallets] = useState([]);
  const [balances, setBalances] = useState({});
  const [loading, setLoading] = useState(true);
  const [transferring, setTransferring] = useState(null);
  const [networkFilter, setNetworkFilter] = useState('all');
  const [destinationAddresses, setDestinationAddresses] = useState({});

  // --- Data Fetching ---
  const fetchAllWallets = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/get_wallets.php`);
      const data = await res.json();
      if (data.success) {
        setWallets(data.wallets);
        fetchBalances(data.wallets);
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
        const tokenAddress = USDT_ADDRESSES[wallet.network];
        if (!tokenAddress) {
          return { id: wallet.id, balance: 'Error' };
        }

        let balanceBN, decimals;

        if (wallet.network === 'ERC-20' || wallet.network === 'BEP-20') {
          const provider = wallet.network === 'ERC-20' ? ethProvider : bscProvider;
          // Use the new, more complete TOKEN_ABI
          const contract = new ethers.Contract(tokenAddress, TOKEN_ABI, provider);

          // 1. Fetch decimals and balance in parallel
          [decimals, balanceBN] = await Promise.all([
            contract.decimals(),
            contract.balanceOf(wallet.address)
          ]);

        } else if (wallet.network === 'TRC-20') {
          const contract = await tronWeb.contract().at(tokenAddress);

          // 1. Fetch decimals and balance in parallel for TRON
          [decimals, balanceBN] = await Promise.all([
            contract.decimals().call(),
            contract.balanceOf(wallet.address).call()
          ]);
        }

        // 2. Format the balance using the CORRECT number of decimals
        const balanceString = balanceBN ? balanceBN.toString() : '0';
        const formattedBalance = ethers.utils.formatUnits(balanceString, decimals);

        // This will show us the proof in the browser console
        console.log(`Wallet ${wallet.address} - Decimals Found: ${decimals}, Raw: ${balanceString}, Formatted: ${formattedBalance}`);

        return { id: wallet.id, balance: formattedBalance };

      } catch (e) {
        console.error(`Failed to fetch balance for ${wallet.address}:`, e);
        return { id: wallet.id, balance: 'Error' };
      }
    });

    const results = await Promise.all(balancePromises);
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
    // Helper function to normalize network strings
    const normalize = (s) => (s || '').toUpperCase().replace('-', '');

    const erc = wallets.filter(w => normalize(w.network) === 'ERC20').length;
    const bep = wallets.filter(w => normalize(w.network) === 'BEP20').length;
    const trc = wallets.filter(w => normalize(w.network) === 'TRC20').length;
    
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
        setDestinationAddresses(prev => ({ ...prev, [walletId]: '' }));
        fetchAllWallets();
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
    <>
    <Head>
        <title>Wallet Dashboard</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

    <div className={styles.container}>
      <h1 className={styles.title}>Wallet Dashboard</h1>

      {/* Stats Cards */}
      <div className={styles.statsGrid}>
        <StatCard title="Total Wallets" value={stats.total} loading={loading} />
        <StatCard title="Total Balance" value={stats.totalBalance} loading={loading && !stats.total} />
        <StatCard title="ERC-20 Wallets" value={stats.erc} loading={loading} />
        <StatCard title="BEP-20 Wallets" value={stats.bep} loading={loading} />
        <StatCard title="TRC-20 Wallets" value={stats.trc} loading={loading} />
      </div>

      {/* Controls */}
      <div className={styles.controls}>
        <div>
          <label htmlFor="network-filter" style={{marginRight: '0.5rem'}}>Filter by Network:</label>
          <select 
            id="network-filter"
            className={styles.select}
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
          className={styles.button}
        >
          {loading ? 'Refreshing...' : 'Refresh All'}
        </button>
      </div>

      {/* Wallets Table */}
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Address</th>
              <th>Network</th>
              <th>Balance (USDT)</th>
              <th>Destination Address</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && wallets.length === 0 ? (
              <tr><td colSpan="5" style={{textAlign: 'center', padding: '2rem'}}>Loading wallets...</td></tr>
            ) : filteredWallets.length === 0 ? (
              <tr><td colSpan="5" style={{textAlign: 'center', padding: '2rem'}}>No wallets found for this filter.</td></tr>
            ) : (
              filteredWallets.map((wallet) => (
                <tr key={wallet.id}>
                  <td>
                    <div className={styles.addressCell}>
                      <span title={wallet.address}>
                        {`${wallet.address.substring(0, 6)}...${wallet.address.substring(wallet.address.length - 4)}`}
                      </span>
                      <CopyButton text={wallet.address} />
                    </div>
                  </td>
                  <td>
                    <span className={`${styles.networkBadge} ${
                      wallet.network === 'ERC-20' ? styles.networkERC :
                      wallet.network === 'BEP-20' ? styles.networkBEP :
                      styles.networkTRC
                    }`}>
                      {wallet.network}
                    </span>
                  </td>
                  <td>
                    {balances[wallet.id] === undefined ? (
                      <span style={{fontSize: '0.75rem', color: '#9ca3af'}}>Loading...</span>
                    ) : balances[wallet.id] === 'Error' ? (
                      <span style={{fontSize: '0.75rem', color: '#f87171'}}>Error</span>
                    ) : (
                      <span>{parseFloat(balances[wallet.id]).toFixed(2)}</span>
                    )}
                  </td>
                  <td>
                    <input 
                      type="text"
                      placeholder="0x... or T..."
                      className={styles.textInput}
                      value={destinationAddresses[wallet.id] || ''}
                      onChange={(e) => handleAddressChange(wallet.id, e.target.value)}
                    />
                  </td>
                  <td>
                    <button
                      className={styles.transferButton}
                      onClick={() => handleTransfer(wallet.id)}
                      disabled={transferring === wallet.id || !destinationAddresses[wallet.id]}
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
    </>
  );
}