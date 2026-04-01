import { Response } from 'express';

// Track active SSE connections per wallet
type SseConnection = {
  res: Response;
  wallet: string;
};

const activeConnections: Map<string, SseConnection[]> = new Map();

/**
 * Register a new SSE connection for a wallet
 */
export function registerSseConnection(wallet: string, res: Response): () => void {
  const normalizedWallet = wallet.toLowerCase().trim();
  
  if (!activeConnections.has(normalizedWallet)) {
    activeConnections.set(normalizedWallet, []);
  }

  const connections = activeConnections.get(normalizedWallet)!;
  const connection: SseConnection = { res, wallet: normalizedWallet };
  connections.push(connection);

  console.log(`[SSE] Connected wallet ${normalizedWallet}. Total connections for this wallet: ${connections.length}`);

  // Handle client disconnect
  const cleanup = () => {
    const index = connections.indexOf(connection);
    if (index > -1) {
      connections.splice(index, 1);
    }
    console.log(`[SSE] Disconnected wallet ${normalizedWallet}. Remaining connections for this wallet: ${connections.length}`);
    
    // Clean up empty wallet entries
    if (connections.length === 0) {
      activeConnections.delete(normalizedWallet);
    }
  };

  res.on('close', cleanup);
  res.on('error', cleanup);

  // Cleanup function to be called elsewhere if needed
  return cleanup;
}

/**
 * Emit an event to all connections for a specific wallet
 */
export function emitEventToWallet(wallet: string, eventType: string, data: any) {
  const normalizedWallet = wallet.toLowerCase().trim();
  const connections = activeConnections.get(normalizedWallet);

  if (!connections || connections.length === 0) {
    console.log(`[SSE] No active connections for wallet ${normalizedWallet}`);
    return;
  }

  console.log(`[SSE] Emitting event "${eventType}" to ${connections.length} connection(s) for wallet ${normalizedWallet}`);

  connections.forEach((connection, index) => {
    try {
      connection.res.write(`event: ${eventType}\n`);
      connection.res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      console.error(`[SSE] Error writing to connection ${index}:`, error);
      // Connection may have closed; it will be cleaned up by the close handler
    }
  });
}

/**
 * Emit an event to all connections for multiple wallets
 */
export function emitEventToWallets(wallets: string[], eventType: string, data: any) {
  wallets.forEach((wallet) => {
    emitEventToWallet(wallet, eventType, data);
  });
}

/**
 * Get count of active connections (for monitoring)
 */
export function getActiveConnectionCount(): number {
  let total = 0;
  activeConnections.forEach((connections) => {
    total += connections.length;
  });
  return total;
}

/**
 * Get count of monitored wallets
 */
export function getMonitoredWalletCount(): number {
  return activeConnections.size;
}
