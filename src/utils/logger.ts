export interface StructuredLogPayload {
  timestamp?: number;
  level: 'INFO' | 'WARN' | 'ERROR';
  category: 'QUANT' | 'RISK' | 'EXEC' | 'COMPLIANCE' | 'SYSTEM';
  event: string;
  trace_id?: string;
  asset?: string;
  strategy?: string;
  score?: number;
  threshold?: number;
  reason?: string;
  [key: string]: any;
}

/**
 * Structured Logger for G-303
 * Formats: [CATEGORY][LEVEL] <message> | JSON:<payload>
 * Strips sensitive data like keys, tokens, and raw broker auth payloads.
 */
export function logStructured(
  category: 'QUANT' | 'RISK' | 'EXEC' | 'COMPLIANCE' | 'SYSTEM',
  level: 'INFO' | 'WARN' | 'ERROR',
  event: string,
  message: string,
  fields: Omit<StructuredLogPayload, 'category' | 'level' | 'event' | 'timestamp'> = {}
) {
  const timestamp = Date.now();
  const payload: StructuredLogPayload = {
    timestamp,
    level,
    category,
    event,
    ...fields
  };

  // Redaction utility
  const redact = (obj: any): any => {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(redact);
    const redacted: any = {};
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'apikey', 'auth', 'credential', 'private', 'seed'];
    for (const k of Object.keys(obj)) {
      const lowerK = k.toLowerCase();
      if (sensitiveKeys.some(sk => lowerK.includes(sk))) {
        redacted[k] = '[REDACTED]';
      } else if (typeof obj[k] === 'object') {
        redacted[k] = redact(obj[k]);
      } else {
        redacted[k] = obj[k];
      }
    }
    return redacted;
  };

  const cleanPayload = redact(payload);
  const prefix = `[${category}][${level}]`;
  const formattedMsg = `${prefix} ${message} | JSON:${JSON.stringify(cleanPayload)}`;

  if (level === 'ERROR') {
    console.error(formattedMsg);
  } else if (level === 'WARN') {
    console.warn(formattedMsg);
  } else {
    console.log(formattedMsg);
  }

  return { formattedMsg, payload: cleanPayload };
}
