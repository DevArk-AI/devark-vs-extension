/**
 * MockHttpClient
 *
 * In-memory HTTP client for testing API clients without network calls.
 * Allows setting up expected responses and tracking requests.
 */

import type {
  IHttpClient,
  HttpRequestOptions,
  HttpResponse,
  HttpError,
  RequestInterceptor,
  ResponseInterceptor,
  ErrorInterceptor,
} from '../../src/ports/network/http-client.interface';

interface MockRequest {
  method: string;
  url: string;
  data?: unknown;
  headers?: Record<string, string>;
}

interface MockResponseConfig {
  data: unknown;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
}

interface MockErrorConfig {
  message: string;
  status?: number;
  statusText?: string;
  isNetworkError?: boolean;
}

export class MockHttpClient implements IHttpClient {
  private baseUrl = '';
  private authToken: string | null = null;
  private defaultHeaders: Record<string, string> = {};

  // Request tracking
  private requests: MockRequest[] = [];

  // Response configuration
  private responses: Map<string, MockResponseConfig> = new Map();
  private errors: Map<string, MockErrorConfig> = new Map();

  // Default response for unmatched requests
  private defaultResponse: MockResponseConfig = { data: {}, status: 200 };

  // Interceptors (not typically used in tests, but required by interface)
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private errorInterceptors: ErrorInterceptor[] = [];

  // === Setup Methods ===

  /**
   * Set response for a specific URL pattern
   * @param urlPattern - URL to match (can use * as wildcard)
   * @param response - Response to return
   */
  setResponse(urlPattern: string, response: MockResponseConfig): void {
    this.responses.set(urlPattern, response);
  }

  /**
   * Set error for a specific URL pattern
   */
  setError(urlPattern: string, error: MockErrorConfig): void {
    this.errors.set(urlPattern, error);
  }

  /**
   * Set the default response for unmatched URLs
   */
  setDefaultResponse(response: MockResponseConfig): void {
    this.defaultResponse = response;
  }

  /**
   * Clear all configured responses and recorded requests
   */
  reset(): void {
    this.responses.clear();
    this.errors.clear();
    this.requests = [];
    this.authToken = null;
    this.defaultHeaders = {};
  }

  // === Inspection Methods ===

  /**
   * Get all recorded requests
   */
  getRequests(): MockRequest[] {
    return [...this.requests];
  }

  /**
   * Get requests matching a URL pattern
   */
  getRequestsTo(urlPattern: string): MockRequest[] {
    return this.requests.filter((r) => this.matchUrl(r.url, urlPattern));
  }

  /**
   * Get the last request made
   */
  getLastRequest(): MockRequest | undefined {
    return this.requests[this.requests.length - 1];
  }

  /**
   * Check if a request was made to a URL
   */
  wasRequestMadeTo(urlPattern: string): boolean {
    return this.requests.some((r) => this.matchUrl(r.url, urlPattern));
  }

  /**
   * Get the current auth token
   */
  getAuthToken(): string | null {
    return this.authToken;
  }

  // === IHttpClient Implementation ===

  async get<T = unknown>(
    url: string,
    options?: Partial<HttpRequestOptions>
  ): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, method: 'GET', url });
  }

  async post<T = unknown>(
    url: string,
    data?: unknown,
    options?: Partial<HttpRequestOptions>
  ): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, method: 'POST', url, data });
  }

  async put<T = unknown>(
    url: string,
    data?: unknown,
    options?: Partial<HttpRequestOptions>
  ): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, method: 'PUT', url, data });
  }

  async delete<T = unknown>(
    url: string,
    options?: Partial<HttpRequestOptions>
  ): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, method: 'DELETE', url });
  }

  async request<T = unknown>(options: HttpRequestOptions): Promise<HttpResponse<T>> {
    const fullUrl = this.buildUrl(options.url);

    // Record the request
    this.requests.push({
      method: options.method,
      url: fullUrl,
      data: options.data,
      headers: {
        ...this.defaultHeaders,
        ...options.headers,
        ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
      },
    });

    // Check for configured error
    const errorConfig = this.findMatch(this.errors, fullUrl);
    if (errorConfig) {
      const error = this.createError(errorConfig);
      throw error;
    }

    // Find matching response
    const responseConfig = this.findMatch(this.responses, fullUrl) || this.defaultResponse;

    return {
      data: responseConfig.data as T,
      status: responseConfig.status ?? 200,
      statusText: responseConfig.statusText ?? 'OK',
      headers: responseConfig.headers ?? {},
    };
  }

  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  }

  setDefaultHeaders(headers: Record<string, string>): void {
    this.defaultHeaders = { ...this.defaultHeaders, ...headers };
  }

  setAuthToken(token: string | null): void {
    this.authToken = token;
  }

  addRequestInterceptor(interceptor: RequestInterceptor): () => void {
    this.requestInterceptors.push(interceptor);
    return () => {
      const index = this.requestInterceptors.indexOf(interceptor);
      if (index !== -1) this.requestInterceptors.splice(index, 1);
    };
  }

  addResponseInterceptor(interceptor: ResponseInterceptor): () => void {
    this.responseInterceptors.push(interceptor);
    return () => {
      const index = this.responseInterceptors.indexOf(interceptor);
      if (index !== -1) this.responseInterceptors.splice(index, 1);
    };
  }

  addErrorInterceptor(interceptor: ErrorInterceptor): () => void {
    this.errorInterceptors.push(interceptor);
    return () => {
      const index = this.errorInterceptors.indexOf(interceptor);
      if (index !== -1) this.errorInterceptors.splice(index, 1);
    };
  }

  // === Private Helpers ===

  private buildUrl(url: string): string {
    if (!this.baseUrl || url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    const path = url.startsWith('/') ? url : `/${url}`;
    return `${this.baseUrl}${path}`;
  }

  private matchUrl(url: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(url);
    }
    return url.includes(pattern);
  }

  private findMatch<T>(map: Map<string, T>, url: string): T | undefined {
    // First try exact match
    if (map.has(url)) {
      return map.get(url);
    }
    // Then try pattern matching
    for (const [pattern, value] of map.entries()) {
      if (this.matchUrl(url, pattern)) {
        return value;
      }
    }
    return undefined;
  }

  private createError(config: MockErrorConfig): HttpError {
    const error = new Error(config.message) as HttpError;
    error.status = config.status;
    error.statusText = config.statusText;
    error.isNetworkError = config.isNetworkError ?? false;
    if (config.status) {
      error.response = {
        data: { error: config.message },
        status: config.status,
        statusText: config.statusText ?? 'Error',
        headers: {},
      };
    }
    return error;
  }
}
