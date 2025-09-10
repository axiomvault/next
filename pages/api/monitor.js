// Use 'import' for ES Module consistency
import { checkTransactionStatus } from '../../lib/monitor';

export default async function handler(req, res) {
  // Set CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', 'https://axiomcommunity.co');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS preflight request for CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Use a single try...catch block for cleaner error handling
  try {
    // Only allow GET method
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { address, amount, network } = req.query;

    // Validate that all required parameters are present
    if (!address || !amount || !network) {
      return res.status(400).json({ error: 'Missing required parameters: address, amount, network' });
    }

    // Parse and validate the amount
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount)) {
      return res.status(400).json({ error: 'Invalid amount format. Must be a number.' });
    }

    // Call the core logic
    const result = await checkTransactionStatus(
      network.toLowerCase(),
      address,
      parsedAmount
    );

    // Send the successful result
    return res.status(200).json(result);

  } catch (error) {
    // ❗ Log the actual error on the server for debugging
    console.error('API Error in checkTransactionStatus handler:', error);

    // Send a generic error response to the client
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
}