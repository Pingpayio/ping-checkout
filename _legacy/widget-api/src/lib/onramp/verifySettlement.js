// src/lib/onramp/verifySettlement.js
import { JsonRpcProvider, Contract } from "ethers";
import fetch from 'node-fetch';

const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

// Base USDC contract address (mainnet)
const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// Environment configuration
const VERIFY_BLOCK_LOOKBACK = parseInt(process.env.VERIFY_BLOCK_LOOKBACK || "5000", 10);
const NEAR_INDEXER_BASE = process.env.NEAR_INDEXER_BASE || "https://nearblocks.io";
const NEAR_FT_TRANSFER_TEMPLATE = process.env.NEAR_FT_TRANSFER_TEMPLATE || "/api/v1/ft/transfers?contract={contract}&to={to}&from_block={from}&limit=50";

export async function verifySettlement({ networkId, tokenAddress, to, minAmount = "0" }) {
  try {
    if (networkId === "base") {
      return await verifyBaseSettlement({ tokenAddress, to, minAmount });
    } else if (networkId === "near") {
      return await verifyNearSettlement({ tokenAddress, to, minAmount });
    }
    
    console.log(`[verifySettlement] Unsupported network: ${networkId}`);
    return null;
  } catch (error) {
    console.error(`[verifySettlement] Failed for ${networkId}:`, error.message);
    return null;
  }
}

async function verifyBaseSettlement({ tokenAddress, to, minAmount }) {
  const rpcUrl = process.env.BASE_RPC_URL;
  if (!rpcUrl) {
    console.error("[verifyBaseSettlement] BASE_RPC_URL not configured");
    return null;
  }

  const provider = new JsonRpcProvider(rpcUrl);
  
  // Use Base USDC if no specific token address provided
  const contractAddress = tokenAddress === "usdc.base" ? BASE_USDC_ADDRESS : tokenAddress;
  
  const contract = new Contract(contractAddress, ERC20_ABI, provider);
  
  // Get recent blocks with configurable lookback
  const currentBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, currentBlock - VERIFY_BLOCK_LOOKBACK);
  
  console.log(`[verifyBaseSettlement] Scanning blocks ${fromBlock} to ${currentBlock} for transfers to ${to}`);
  
  try {
    // Look for Transfer events to the recipient address
    const filter = contract.filters.Transfer(null, to);
    const logs = await provider.getLogs({
      ...filter,
      fromBlock,
      toBlock: currentBlock
    });
    
    if (logs.length === 0) {
      console.log(`[verifyBaseSettlement] No transfers found to ${to}`);
      return null;
    }
    
    // Get the most recent transfer
    const latestLog = logs[logs.length - 1];
    
    // Parse the transfer amount
    const transferEvent = contract.interface.parseLog(latestLog);
    const amountReceived = transferEvent.args.value.toString();
    
    // Check minimum amount if specified
    if (minAmount !== "0" && BigInt(amountReceived) < BigInt(minAmount)) {
      console.log(`[verifyBaseSettlement] Transfer amount ${amountReceived} below minimum ${minAmount}`);
      return null;
    }
    
    console.log(`[verifyBaseSettlement] Found transfer: ${amountReceived} to ${to} in tx ${latestLog.transactionHash}`);
    
    return {
      txHash: latestLog.transactionHash,
      blockNumber: latestLog.blockNumber,
      amountReceived,
      from: transferEvent.args.from,
      to: transferEvent.args.to
    };
  } catch (error) {
    console.error(`[verifyBaseSettlement] RPC error:`, error.message);
    return null;
  }
}

async function verifyNearSettlement({ tokenAddress, to, minAmount }) {
  try {
    // Extract contract from tokenAddress (e.g., "usdc.near" -> "usdc.near")
    const contract = tokenAddress.replace(/^nep141:/, '');
    
    // Get current block height for lookback
    const currentBlock = await getNearCurrentBlock();
    const fromBlock = Math.max(0, currentBlock - VERIFY_BLOCK_LOOKBACK);
    
    console.log(`[verifyNearSettlement] Scanning NEAR blocks ${fromBlock} to ${currentBlock} for ${contract} transfers to ${to}`);
    
    // Build the indexer URL using the template
    const indexerUrl = `${NEAR_INDEXER_BASE}${NEAR_FT_TRANSFER_TEMPLATE}`
      .replace('{contract}', contract)
      .replace('{to}', to)
      .replace('{from}', fromBlock);
    
    console.log(`[verifyNearSettlement] Querying: ${indexerUrl}`);
    
    const response = await fetch(indexerUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'PingPay-Widget-API/1.0'
      },
      timeout: 10000 // 10 second timeout
    });
    
    if (!response.ok) {
      console.error(`[verifyNearSettlement] Indexer error: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const data = await response.json();
    
    // Handle different indexer response formats
    const transfers = data.transfers || data.data || data || [];
    
    if (!Array.isArray(transfers) || transfers.length === 0) {
      console.log(`[verifyNearSettlement] No transfers found to ${to}`);
      return null;
    }
    
    // Get the most recent transfer
    const latestTransfer = transfers[0]; // Assuming sorted by block height desc
    
    // Parse amount and check minimum
    const amountReceived = latestTransfer.amount || latestTransfer.value || "0";
    if (minAmount !== "0" && BigInt(amountReceived) < BigInt(minAmount)) {
      console.log(`[verifyNearSettlement] Transfer amount ${amountReceived} below minimum ${minAmount}`);
      return null;
    }
    
    console.log(`[verifyNearSettlement] Found transfer: ${amountReceived} to ${to} in tx ${latestTransfer.transaction_hash}`);
    
    return {
      txHash: latestTransfer.transaction_hash || latestTransfer.txHash,
      blockNumber: latestTransfer.block_height || latestTransfer.blockNumber,
      amountReceived,
      from: latestTransfer.from || latestTransfer.sender,
      to: latestTransfer.to || latestTransfer.receiver
    };
    
  } catch (error) {
    console.error(`[verifyNearSettlement] Failed:`, error.message);
    return null;
  }
}

async function getNearCurrentBlock() {
  try {
    // Use a simple NEAR RPC call to get current block
    const rpcUrl = process.env.NEAR_RPC_URL || "https://rpc.mainnet.near.org";
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "dontcare",
        method: "block",
        params: { finality: "final" }
      }),
      timeout: 5000
    });
    
    const data = await response.json();
    return parseInt(data.result.header.height, 10);
  } catch (error) {
    console.warn(`[getNearCurrentBlock] Failed to get current block: ${error.message}`);
    // Fallback to a reasonable recent block number
    return 100000000; // Approximate current NEAR mainnet block
  }
}
