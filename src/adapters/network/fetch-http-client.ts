/**
 * FetchHttpClient - Native fetch-based HTTP client
 *
 * Zero external dependencies, uses native fetch API.
 * Supports interceptors, auth tokens, and proper error handling.
 */

import type {
  IHttpClient,
  HttpRequestOptions,
  HttpResponse,
  HttpError,
  RequestInterceptor,
  ResponseInterceptor,
  ErrorInterceptor,
} from '../../ports/network/http-client.interface';

export class FetchHttpClient implements IHttpClient {
  private baseUrl = '';
  private authToken: string | null = null;
  private defaultHeaders: Record<string, string> = {};
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private errorInterceptors: ErrorInterceptor[] = [];

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
    // Build initial config
    let config: HttpRequestOptions = {
      ...options,
      headers: {
        ...this.defaultHeaders,
        ...options.headers,
      },
    };

    // Add auth header if token is set
    if (this.authToken) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${this.authToken}`,
      };
    }

    // Add Content-Type for requests with body
    if (config.data !== undefined) {
      config.headers = {
        'Content-Type': 'application/json',
        ...config.headers,
      };
    }

    // Run request interceptors
    for (const interceptor of this.requestInterceptors) {
      config = await interceptor(config);
    }

    // Build full URL
    const fullUrl = this.buildUrl(config.url, config.baseUrl);

    // Debug logging for auth issues
    console.log('[FetchHttpClient] Request:', config.method, fullUrl);
    console.log('[FetchHttpClient] Has authToken:', !!this.authToken);
    if (this.authToken) {
      console.log('[FetchHttpClient] Token prefix:', this.authToken.substring(0, 10) + '...');
    }

    // Build fetch options
    const fetchOptions: RequestInit = {
      method: config.method,
      headers: config.headers,
    };

    if (config.data !== undefined) {
      fetchOptions.body = JSON.stringify(config.data);
    }

    // Add timeout via AbortController if specified
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (config.timeout) {
      const controller = new AbortController();
      fetchOptions.signal = controller.signal;
      timeoutId = setTimeout(() => controller.abort(), config.timeout);
    }

    try {
      const fetchResponse = await fetch(fullUrl, fetchOptions);

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Parse response
      let data: T;
      const contentType = fetchResponse.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        try {
          data = await fetchResponse.json() as T;
        } catch {
          data = null as T;
        }
      } else {
        try {
          const text = await fetchResponse.text();
          // Try to parse as JSON anyway
          data = text ? JSON.parse(text) as T : (null as T);
        } catch {
          data = null as T;
        }
      }

      // Extract headers
      const headers: Record<string, string> = {};
      fetchResponse.headers.forEach((value, key) => {
        headers[key] = value;
      });

      // Build response object
      let response: HttpResponse<T> = {
        data,
        status: fetchResponse.status,
        statusText: fetchResponse.statusText,
        headers,
      };

      // Check for error status
      if (!fetchResponse.ok) {
        console.log('[FetchHttpClient] Response Error:', fetchResponse.status, fetchResponse.statusText, data);
        const error = this.createHttpError(
          `Request failed with status ${fetchResponse.status}`,
          fetchResponse.status,
          fetchResponse.statusText,
          response,
          false
        );

        // Run error interceptors
        for (const interceptor of this.errorInterceptors) {
          await interceptor(error);
        }

        throw error;
      }

      // Run response interceptors
      for (const interceptor of this.responseInterceptors) {
        response = await interceptor(response) as HttpResponse<T>;
      }

      return response;
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Handle already-processed HttpError
      if (this.isHttpError(error)) {
        throw error;
      }

      // Handle network/abort errors
      const isNetworkError = this.isNetworkOrAbortError(error);
      const httpError = this.createHttpError(
        error instanceof Error ? error.message : 'Network error',
        undefined,
        undefined,
        undefined,
        isNetworkError
      );

      // Run error interceptors
      for (const interceptor of this.errorInterceptors) {
        await interceptor(httpError);
      }

      throw httpError;
    }
  }

  setBaseUrl(baseUrl: string): void {
    // Remove trailing slash
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  }

  setDefaultHeaders(headers: Record<string, string>): void {
    this.defaultHeaders = { ...this.defaultHeaders, ...headers };
  }

  setAuthToken(token: string | null): void {
    console.log('[FetchHttpClient] setAuthToken called:', token ? token.substring(0, 10) + '...' : 'null');
    this.authToken = token;
  }

  addRequestInterceptor(interceptor: RequestInterceptor): () => void {
    this.requestInterceptors.push(interceptor);
    return () => {
      const index = this.requestInterceptors.indexOf(interceptor);
      if (index !== -1) {
        this.requestInterceptors.splice(index, 1);
      }
    };
  }

  addResponseInterceptor(interceptor: ResponseInterceptor): () => void {
    this.responseInterceptors.push(interceptor);
    return () => {
      const index = this.responseInterceptors.indexOf(interceptor);
      if (index !== -1) {
        this.responseInterceptors.splice(index, 1);
      }
    };
  }

  addErrorInterceptor(interceptor: ErrorInterceptor): () => void {
    this.errorInterceptors.push(interceptor);
    return () => {
      const index = this.errorInterceptors.indexOf(interceptor);
      if (index !== -1) {
        this.errorInterceptors.splice(index, 1);
      }
    };
  }

  // === Private Helpers ===

  private buildUrl(url: string, requestBaseUrl?: string): string {
    const base = requestBaseUrl || this.baseUrl;
    if (!base || url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    // Ensure proper joining
    const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
    const normalizedPath = url.startsWith('/') ? url : `/${url}`;
    return `${normalizedBase}${normalizedPath}`;
  }

  private createHttpError(
    message: string,
    status?: number,
    statusText?: string,
    response?: HttpResponse,
    isNetworkError = false
  ): HttpError {
    const error = new Error(message) as HttpError;
    error.status = status;
    error.statusText = statusText;
    error.response = response;
    error.isNetworkError = isNetworkError;
    return error;
  }

  private isHttpError(error: unknown): error is HttpError {
    return (
      error instanceof Error &&
      'isNetworkError' in error &&
      typeof (error as HttpError).isNetworkError === 'boolean'
    );
  }

  private isNetworkOrAbortError(error: unknown): boolean {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return true;
    }
    if (error instanceof TypeError) {
      return true; // fetch throws TypeError for network errors
    }
    return false;
  }
}
