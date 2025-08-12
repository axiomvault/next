const { checkTransactionStatus } = require('../../lib/monitor');

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { address, amount, network } = req.query;

    if (!address || !amount || !network) {
        return res.status(400).json({ error: 'Missing parameters' });
    }

    try {
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount)) {
            throw new Error('Invalid amount format');
        }

        const result = await checkTransactionStatus(
            network.toLowerCase(),
            address,
            parsedAmount
        );

        return res.status(200).json(result);
    } catch (err) {
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}