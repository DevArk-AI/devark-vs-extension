/**
 * HTTP Client Interface
 *
 * Low-level HTTP abstraction. This allows swapping
 * implementations (axios, fetch, node-fetch) and makes testing easier.
 */

/**
 * HTTP request configuration
 */
export interface HttpRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  baseUrl?: string;
  data?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
  validateStatus?: (status: number) => boolean;
}

/**
 * HTTP response
 */
export interface HttpResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

/**
 * HTTP error
 */
export interface HttpError extends Error {
  status?: number;
  statusText?: string;
  response?: HttpResponse;
  code?: string;
  isNetworkError: boolean;
}

/**
 * Request interceptor
 */
export type RequestInterceptor = (
  config: HttpRequestOptions
) => Promise<HttpRequestOptions> | HttpRequestOptions;

/**
 * Response interceptor
 */
export type ResponseInterceptor<T = unknown> = (
  response: HttpResponse<T>
) => Promise<HttpResponse<T>> | HttpResponse<T>;

/**
 * Error interceptor
 */
export type ErrorInterceptor = (error: HttpError) => Promise<never>;

export interface IHttpClient {
  /**
   * Make a GET request
   * @param url Request URL
   * @param options Additional options
   */
  get<T = unknown>(
    url: string,
    options?: Partial<HttpRequestOptions>
  ): Promise<HttpResponse<T>>;

  /**
   * Make a POST request
   * @param url Request URL
   * @param data Request body
   * @param options Additional options
   */
  post<T = unknown>(
    url: string,
    data?: unknown,
    options?: Partial<HttpRequestOptions>
  ): Promise<HttpResponse<T>>;

  /**
   * Make a PUT request
   * @param url Request URL
   * @param data Request body
   * @param options Additional options
   */
  put<T = unknown>(
    url: string,
    data?: unknown,
    options?: Partial<HttpRequestOptions>
  ): Promise<HttpResponse<T>>;

  /**
   * Make a DELETE request
   * @param url Request URL
   * @param options Additional options
   */
  delete<T = unknown>(
    url: string,
    options?: Partial<HttpRequestOptions>
  ): Promise<HttpResponse<T>>;

  /**
   * Make a generic request
   * @param options Full request options
   */
  request<T = unknown>(options: HttpRequestOptions): Promise<HttpResponse<T>>;

  /**
   * Set the base URL for all requests
   * @param baseUrl The base URL
   */
  setBaseUrl(baseUrl: string): void;

  /**
   * Set default headers for all requests
   * @param headers Headers to set
   */
  setDefaultHeaders(headers: Record<string, string>): void;

  /**
   * Set the authorization token
   * @param token Bearer token
   */
  setAuthToken(token: string | null): void;

  /**
   * Add a request interceptor
   * @param interceptor The interceptor function
   * @returns Function to remove the interceptor
   */
  addRequestInterceptor(interceptor: RequestInterceptor): () => void;

  /**
   * Add a response interceptor
   * @param interceptor The interceptor function
   * @returns Function to remove the interceptor
   */
  addResponseInterceptor(interceptor: ResponseInterceptor): () => void;

  /**
   * Add an error interceptor
   * @param interceptor The interceptor function
   * @returns Function to remove the interceptor
   */
  addErrorInterceptor(interceptor: ErrorInterceptor): () => void;
}
