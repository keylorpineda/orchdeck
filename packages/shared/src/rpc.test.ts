import { describe, expect, it } from 'vitest';
import {
  JSONRPC_VERSION,
  isJsonRpcErrorResponse,
  isJsonRpcRequest,
  isJsonRpcResponse,
} from './rpc.js';

describe('JSON-RPC type guards', () => {
  it('accepts valid JSON-RPC 2.0 requests', () => {
    expect(
      isJsonRpcRequest({
        jsonrpc: JSONRPC_VERSION,
        id: 1,
        method: 'daemon.health',
        params: {},
      }),
    ).toBe(true);
  });

  it('rejects malformed requests', () => {
    expect(isJsonRpcRequest(null)).toBe(false);
    expect(isJsonRpcRequest({ jsonrpc: '1.0', id: 1, method: 'daemon.health', params: {} })).toBe(
      false,
    );
    expect(isJsonRpcRequest({ jsonrpc: JSONRPC_VERSION, id: 1, method: '', params: {} })).toBe(
      false,
    );
  });

  it('distinguishes success and error responses', () => {
    const okResp = {
      jsonrpc: JSONRPC_VERSION,
      id: 'req-1',
      result: { pong: true, timestamp: '2026-11-27T00:00:00Z' },
    };
    const errResp = {
      jsonrpc: JSONRPC_VERSION,
      id: 'req-1',
      error: { code: -32001, message: 'Unauthorized' },
    };

    expect(isJsonRpcResponse(okResp)).toBe(true);
    expect(isJsonRpcResponse(errResp)).toBe(true);
    if (isJsonRpcResponse(errResp)) {
      expect(isJsonRpcErrorResponse(errResp)).toBe(true);
    }
  });
});
