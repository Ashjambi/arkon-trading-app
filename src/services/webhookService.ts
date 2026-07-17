export const getEffectiveUrl = (url: string): string => {
  if (!url) return "";
  const isLocal = url.includes("127.0.0.1") || url.includes("localhost") || url.includes("localhost:3000") || url.includes("0.0.0.0");
  const isCloudHost = typeof window !== "undefined" && window.location && window.location.origin && !window.location.origin.includes("localhost") && !window.location.origin.includes("127.0.0.1") && !window.location.origin.includes("0.0.0.0");
  
  if (isLocal && isCloudHost) {
    return window.location.origin;
  }
  return url;
};

const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = 60000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(new Error(`Webhook request timeout for ${url}`)), timeout);
  try {
    const response = await fetch(getEffectiveUrl(url), { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (e: any) {
    clearTimeout(id);
    if (e.name === 'AbortError') {
      if (controller.signal.reason) throw controller.signal.reason;
      throw new Error(`Request timed out after ${timeout}ms`);
    }
    throw e;
  }
};

import { logSignal } from './signalLogger';

export const sendToWebhook = async (
  signal: any,
  url: string,
  maxAllocation: number,
  actionType: string,
  fixedLotSize: number,
  secret: string,
  forceClosePnL: number
) => {
  if (!url) return { success: false };
  await logSignal(signal);
  try {
    let baseSymbol = signal.asset ? signal.asset.split('-')[0] : '';
    let mappedSymbol = baseSymbol;
    
    // MT5 Standard Symbol Mapping
    if (baseSymbol === 'BTC') {
        mappedSymbol = 'BTCUSD';
    } else if (baseSymbol === 'ETH') {
        mappedSymbol = 'ETHUSD';
    }

    // Clean up nested objects that confuse MT5 JSON parser
    const cleanSignal = { ...signal };
    delete cleanSignal.childOrder;
    delete cleanSignal.executionAnalytics;
    delete cleanSignal.reasoning; // optional, saves bandwidth
    
    // Explicitly remove keys we are going to override so their insertion order is reset to the top
    delete cleanSignal.asset;
    delete cleanSignal.symbol;
    delete cleanSignal.original_symbol;

    const payload = {
      asset: mappedSymbol, // Overwrite asset for old EAs that parse 'asset' instead of 'symbol'
      symbol: mappedSymbol, // Mapped symbol for MT5 (e.g., XAUUSD)
      original_symbol: baseSymbol,
      action: actionType,
      action_type: actionType, // Add action_type for new MT5 bridge to handle HEDGE/FLIP
      maxAllocation,
      fixedLotSize: fixedLotSize,
      lotMultiplier: signal.lotMultiplier || 1.0,
      forceClosePnL,
      secret: secret, // Add secret to payload for bridge validation
      ...cleanSignal,
    };
    console.log(`[Webhook] Sending payload to MT5 Bridge. Mapped Symbol: ${mappedSymbol}`, JSON.stringify(payload));

    // Use the provided url
    let effectiveUrl = getEffectiveUrl(url);
    
    // Ensure proper formatting for external URLs
    let finalUrl = effectiveUrl.replace(/\/$/, '') + '/api/signals';
    console.log(`[Webhook] Attempting to send to: ${finalUrl} with secret: ${secret ? '***' : 'MISSING'}`);

    const response = await fetchWithTimeout(finalUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
        console.warn(`Error sending to webhook: ${url} returned status ${response.status}`);
        return { success: false };
    }
    
    try {
        const responseData = await response.json();
        console.log("Webhook response:", responseData);
    } catch (e) {
        console.log("Webhook response was not JSON");
    }
    
    return { success: true };
  } catch (error: any) {
    console.warn(`Error sending to webhook to ${url}:`, error.message || error);
    return { success: false };
  }
};

export const checkBridgeStatus = async (url: string, secret?: string) => {
  if (!url) return false;
  let baseUrl = getEffectiveUrl(url).replace(/\/$/, '');
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetchWithTimeout(`${baseUrl}/api/bridge/status`, {
        headers: {
          ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
        },
      }, 10000);
      
      if (response.ok) {
        return true;
      }
    } catch (error: any) {
      if (attempt === 3) {
        console.log(`Bridge status check info (unreachable): ${error.message || error}`);
        return false;
      }
      // Wait 1 second before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  return false;
};

export const fetchBridgeState = async (url: string, secret?: string) => {
  if (!url) return null;
  let baseUrl = getEffectiveUrl(url).replace(/\/$/, '');
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetchWithTimeout(`${baseUrl}/api/bridge/state`, {
        headers: {
          ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
        },
      }, 15000);
      if (response.ok) {
        return await response.json();
      }
    } catch (error: any) {
      if (attempt === 3) return null;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  return null;
};

export const clearRemoteBridge = async (url: string, secret: string) => {
  if (!url) return { success: false };
  try {
    let baseUrl = getEffectiveUrl(url).replace(/\/$/, '');
    const response = await fetchWithTimeout(`${baseUrl}/api/bridge/clear`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
      },
    }, 5000);
    return { success: response.ok };
  } catch (error) {
    // Suppress expected network errors when bridge is offline
    return { success: false };
  }
};
