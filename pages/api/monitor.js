import fetch from "node-fetch";

export default async function handler(req, res) {
    try {
        const { address, amount, network } = req.query;

        if (!address || !amount || !network) {
            return res.status(400).json({ error: "Missing required parameters" });
        }

        const expectedAmount = Number(amount);
        const normalize = (val) => Number(val).toFixed(6); // USDT has 6 decimals

        let apiUrl = "";
        if (network === "bep20") {
            // BSCScan API
            apiUrl = `https://api.bscscan.com/api?module=account&action=tokentx&address=${address}&sort=desc&apikey=${process.env.BSCSCAN_KEY}`;
        } else if (network === "erc20") {
            apiUrl = `https://api.etherscan.io/api?module=account&action=tokentx&address=${address}&sort=desc&apikey=${process.env.ETHERSCAN_KEY}`;
        } else if (network === "trc20") {
            // TronGrid API
            apiUrl = `https://apilist.tronscanapi.com/api/transfer/trc20?toAddress=${address}&limit=10&sort=-timestamp`;
        } else {
            return res.status(400).json({ error: "Unsupported network" });
        }

        // Fetch recent transactions
        const resp = await fetch(apiUrl);
        const data = await resp.json();

        let transactions = [];
        if (network === "trc20") {
            transactions = data.token_transfers || [];
        } else {
            transactions = data.result || [];
        }

        // Find matching confirmed transaction
        const match = transactions.find((tx) => {
            let toAddr = "";
            let amt = 0;
            let success = true;

            if (network === "trc20") {
                toAddr = tx.to_address;
                amt = Number(tx.amount_str) / Math.pow(10, 6);
            } else {
                toAddr = tx.to;
                amt = Number(tx.value) / Math.pow(10, 6);
                success = tx.txreceipt_status === "1"; // Etherscan/BSCScan
            }

            return (
                toAddr?.toLowerCase() === address.toLowerCase() &&
                normalize(amt) === normalize(expectedAmount) &&
                success
            );
        });

        if (match) {
            return res.status(200).json({
                status: "confirmed",
                txHash:
                    network === "trc20" ? match.transaction_id : match.hash
            });
        }

        // No matching confirmed tx yet
        return res.status(200).json({ status: "pending" });

    } catch (err) {
        console.error("❌ Monitor error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
}
