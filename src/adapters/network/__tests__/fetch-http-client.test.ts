/**
 * FetchHttpClient Tests - TDD
 *
 * Tests written FIRST before implementation (RED phase).
 * HTTP client using native fetch with interceptor support.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { FetchHttpClient } from '../fetch-http-client';
import type { HttpRequestOptions, HttpError } from '../../../ports/network/http-client.interface';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Helper to create mock responses
function createMockResponse(
  data: unknown,
  status = 200,
  statusText = 'OK',
  headers: Record<string, string> = {}
): Response {
  const headersInstance = new Headers(headers);
  headersInstance.set('content-type', 'application/json');

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: headersInstance,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response;
}

// Helper to create network error
function createNetworkError(message = 'Network error'): TypeError {
  const error = new TypeError(message);
  (error as any).cause = { code: 'ECONNREFUSED' };
  return error;
}

describe('FetchHttpClient', () => {
  let client: FetchHttpClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new FetchHttpClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('request methods', () => {
    it('get() makes GET request with correct URL', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: 'test' }));

      await client.get('/api/test');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('post() sends body as JSON with Content-Type header', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ success: true }));

      const body = { name: 'John', age: 30 };
      await client.post('/api/users', body);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/users',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(body),
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('put() sends body as JSON', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ updated: true }));

      const body = { name: 'Jane' };
      await client.put('/api/users/1', body);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/users/1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(body),
        })
      );
    });

    it('delete() makes DELETE request', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ deleted: true }));

      await client.delete('/api/users/1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/users/1',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('request() handles all HTTP methods', async () => {
      mockFetch.mockResolvedValue(createMockResponse({ ok: true }));

      const methods: HttpRequestOptions['method'][] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
      for (const method of methods) {
        await client.request({ method, url: '/test' });
        expect(mockFetch).toHaveBeenCalledWith(
          '/test',
          expect.objectContaining({ method })
        );
      }
    });

    it('returns response data, status, and headers', async () => {
      const responseData = { id: 1, name: 'Test' };
      mockFetch.mockResolvedValueOnce(
        createMockResponse(responseData, 201, 'Created', { 'x-custom': 'value' })
      );

      const response = await client.get('/api/item');

      expect(response.data).toEqual(responseData);
      expect(response.status).toBe(201);
      expect(response.statusText).toBe('Created');
      expect(response.headers['content-type']).toBe('application/json');
    });
  });

  describe('configuration', () => {
    it('setAuthToken() adds Bearer Authorization header', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: 'protected' }));

      client.setAuthToken('my-secret-token');
      await client.get('/api/protected');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/protected',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer my-secret-token',
          }),
        })
      );
    });

    it('setAuthToken(null) removes Authorization header', async () => {
      mockFetch.mockResolvedValue(createMockResponse({ data: 'test' }));

      client.setAuthToken('token');
      client.setAuthToken(null);
      await client.get('/api/test');

      const fetchCall = mockFetch.mock.calls[0];
      const headers = fetchCall[1]?.headers || {};
      expect(headers).not.toHaveProperty('Authorization');
    });

    it('setBaseUrl() prepends base URL to relative paths', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: 'test' }));

      client.setBaseUrl('https://api.example.com');
      await client.get('/users');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.anything()
      );
    });

    it('setBaseUrl() handles trailing slashes correctly', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: 'test' }));

      client.setBaseUrl('https://api.example.com/');
      await client.get('/users');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.anything()
      );
    });

    it('setDefaultHeaders() adds headers to all requests', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: 'test' }));

      client.setDefaultHeaders({
        'X-Client-Version': '1.0.0',
        'X-Request-Source': 'extension',
      });
      await client.get('/api/test');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Client-Version': '1.0.0',
            'X-Request-Source': 'extension',
          }),
        })
      );
    });

    it('request-specific headers override default headers', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: 'test' }));

      client.setDefaultHeaders({ 'X-Custom': 'default' });
      await client.get('/api/test', { headers: { 'X-Custom': 'override' } });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom': 'override',
          }),
        })
      );
    });
  });

  describe('interceptors', () => {
    it('request interceptors run in order before request', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: 'test' }));
      const order: number[] = [];

      client.addRequestInterceptor(async (config) => {
        order.push(1);
        return config;
      });
      client.addRequestInterceptor(async (config) => {
        order.push(2);
        return config;
      });

      await client.get('/test');

      expect(order).toEqual([1, 2]);
    });

    it('request interceptor can modify headers', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: 'test' }));

      client.addRequestInterceptor((config) => {
        return {
          ...config,
          headers: {
            ...config.headers,
            'X-Request-ID': 'abc123',
          },
        };
      });

      await client.get('/test');

      expect(mockFetch).toHaveBeenCalledWith(
        '/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Request-ID': 'abc123',
          }),
        })
      );
    });

    it('response interceptors run after response received', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: 'original' }));
      let interceptorRan = false;

      client.addResponseInterceptor((response) => {
        interceptorRan = true;
        return {
          ...response,
          data: { ...response.data as object, modified: true },
        };
      });

      const result = await client.get<{ data: string; modified?: boolean }>('/test');

      expect(interceptorRan).toBe(true);
      expect(result.data.modified).toBe(true);
    });

    it('error interceptor catches failed requests', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ error: 'Not found' }, 404, 'Not Found'));
      let errorInterceptorRan = false;
      let capturedError: HttpError | null = null;

      client.addErrorInterceptor((error) => {
        errorInterceptorRan = true;
        capturedError = error;
        return Promise.reject(error);
      });

      await expect(client.get('/not-found')).rejects.toThrow();

      expect(errorInterceptorRan).toBe(true);
      expect(capturedError?.status).toBe(404);
    });

    it('removing interceptor stops it from running', async () => {
      mockFetch.mockResolvedValue(createMockResponse({ data: 'test' }));
      let count = 0;

      const removeInterceptor = client.addRequestInterceptor((config) => {
        count++;
        return config;
      });

      await client.get('/test');
      expect(count).toBe(1);

      removeInterceptor();
      await client.get('/test');
      expect(count).toBe(1); // Should still be 1
    });
  });

  describe('error handling', () => {
    it('network errors have isNetworkError: true', async () => {
      mockFetch.mockRejectedValueOnce(createNetworkError('Failed to fetch'));

      try {
        await client.get('/api/test');
        expect.fail('Should have thrown');
      } catch (error) {
        const httpError = error as HttpError;
        expect(httpError.isNetworkError).toBe(true);
      }
    });

    it('4xx errors include status and response', async () => {
      const errorData = { error: 'Bad request', details: 'Missing field' };
      mockFetch.mockResolvedValueOnce(createMockResponse(errorData, 400, 'Bad Request'));

      try {
        await client.post('/api/users', {});
        expect.fail('Should have thrown');
      } catch (error) {
        const httpError = error as HttpError;
        expect(httpError.status).toBe(400);
        expect(httpError.statusText).toBe('Bad Request');
        expect(httpError.response?.data).toEqual(errorData);
        expect(httpError.isNetworkError).toBe(false);
      }
    });

    it('5xx errors include status and response', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: 'Internal error' }, 500, 'Internal Server Error')
      );

      try {
        await client.get('/api/data');
        expect.fail('Should have thrown');
      } catch (error) {
        const httpError = error as HttpError;
        expect(httpError.status).toBe(500);
        expect(httpError.isNetworkError).toBe(false);
      }
    });

    it('timeout errors are marked as network errors', async () => {
      const timeoutError = new DOMException('The operation was aborted', 'AbortError');
      mockFetch.mockRejectedValueOnce(timeoutError);

      try {
        await client.get('/api/slow', { timeout: 1000 });
        expect.fail('Should have thrown');
      } catch (error) {
        const httpError = error as HttpError;
        expect(httpError.isNetworkError).toBe(true);
      }
    });

    it('401 errors are properly identified', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: 'Unauthorized' }, 401, 'Unauthorized')
      );

      try {
        await client.get('/api/protected');
        expect.fail('Should have thrown');
      } catch (error) {
        const httpError = error as HttpError;
        expect(httpError.status).toBe(401);
      }
    });
  });

  describe('response parsing', () => {
    it('parses JSON response body', async () => {
      const data = { users: [{ id: 1, name: 'Alice' }] };
      mockFetch.mockResolvedValueOnce(createMockResponse(data));

      const response = await client.get('/api/users');

      expect(response.data).toEqual(data);
    });

    it('returns response headers', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({}, 200, 'OK', {
          'x-request-id': 'req-123',
          'x-rate-limit-remaining': '99',
        })
      );

      const response = await client.get('/api/test');

      expect(response.headers['x-request-id']).toBe('req-123');
      expect(response.headers['x-rate-limit-remaining']).toBe('99');
    });

    it('handles non-JSON responses gracefully', async () => {
      const textResponse: Response = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'text/plain' }),
        json: () => Promise.reject(new SyntaxError('Invalid JSON')),
        text: () => Promise.resolve('Plain text response'),
      } as Response;

      mockFetch.mockResolvedValueOnce(textResponse);

      const response = await client.get('/api/text');

      // Should handle gracefully, returning text or null
      expect(response.status).toBe(200);
    });

    it('handles empty response body', async () => {
      const emptyResponse: Response = {
        ok: true,
        status: 204,
        statusText: 'No Content',
        headers: new Headers(),
        json: () => Promise.reject(new SyntaxError('Unexpected end of JSON')),
        text: () => Promise.resolve(''),
      } as Response;

      mockFetch.mockResolvedValueOnce(emptyResponse);

      const response = await client.delete('/api/item/1');

      expect(response.status).toBe(204);
    });
  });

  describe('timeout handling', () => {
    it('respects timeout option', async () => {
      // Simulate a slow request that would exceed timeout
      mockFetch.mockImplementationOnce(() => new Promise((_, reject) => {
        setTimeout(() => reject(new DOMException('Aborted', 'AbortError')), 50);
      }));

      await expect(
        client.get('/api/slow', { timeout: 100 })
      ).rejects.toThrow();
    });
  });
});
