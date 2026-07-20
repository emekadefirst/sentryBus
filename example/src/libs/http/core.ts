import type { FetchClientConfig, RequestOptions, ApiResponse } from './types';

export class FetchClient {
  private baseURL: string;
  private readonly fixedTimeoutMs = 30000; // 30s
  private readonly maxRetries = 3; // Reduced from 10 for better dev feedback; adjust as needed
  private defaultHeaders: Record<string, string>;

  constructor(baseURL: string = '', options: FetchClientConfig = {}) {
    // Ensure baseURL doesn't have a trailing slash if endpoints have leading slashes
    this.baseURL = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;
    this.defaultHeaders = {
      ...options.headers,
    };
  }

  /**
   * Core request method handling timeouts, retries, and safe parsing
   */
  async request<T = any>(
    endpoint: string,
    options: RequestOptions = {},
    retriesLeft: number = this.maxRetries
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;
    const controller = new AbortController();

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.fixedTimeoutMs);

    const { body: rawBody, ...restOptions } = options;

    // --- Header Logic ---
    const incomingHeaders = (options.headers || {}) as Record<string, string>;
    const requestHeaders = { 
      ...this.defaultHeaders, 
      ...incomingHeaders,
    };

    // If sending binary data, ensure we don't accidentally force application/json
    if (rawBody instanceof Blob || rawBody instanceof Uint8Array || rawBody instanceof ArrayBuffer) {
      const hasContentType = incomingHeaders['Content-Type'] || incomingHeaders['content-type'];
      if (!hasContentType) {
        delete (requestHeaders as any)['Content-Type'];
        delete (requestHeaders as any)['content-type'];
      }
    }

    const config: RequestInit = {
      ...restOptions,
      headers: { ...requestHeaders },
      signal: controller.signal,
    };

    // --- Body Logic ---
    if (rawBody !== undefined) {
      const isPlainObject =
        typeof rawBody === 'object' &&
        rawBody !== null &&
        !(rawBody instanceof Blob) &&
        !(rawBody instanceof ArrayBuffer) &&
        !(rawBody instanceof Uint8Array);

      if (isPlainObject) {
        config.body = JSON.stringify(rawBody);
        // Automatically set Content-Type if not provided for objects
        if (!(requestHeaders['Content-Type'] || requestHeaders['content-type'])) {
          (config.headers as any)['Content-Type'] = 'application/json';
        }
      } else {
        config.body = rawBody as any;
      }
    }

    try {
      const response = await fetch(url, config);

      // --- Safe Body Parsing ---
      const text = await response.text();
      let parsedData: any = text;

      if (text) {
        try {
          parsedData = JSON.parse(text);
        } catch {
          /* Keep as raw text if not valid JSON */
        }
      } else {
        parsedData = null;
      }

      // --- Error Handling & Logging ---
      if (!response.ok) {
        if (response.status >= 500) {
          // Log the body so we can see the server's internal error message
          console.error(`❌ FetchClient Server Error (${response.status}):`, {
            url,
            method: config.method,
            data: parsedData
          });
          throw new Error(`Server Error: ${response.status}`);
        }

        return {
          ok: false,
          status: response.status,
          data: parsedData as T,
          headers: response.headers
        };
      }

      return {
        ok: true,
        status: response.status,
        data: parsedData as T,
        headers: response.headers
      };

    } catch (error: unknown) {
      const isAbort = error instanceof Error && error.name === 'AbortError';
      const isServerError = error instanceof Error && error.message.startsWith('Server Error');

      if (retriesLeft > 0 && (isAbort || isServerError)) {
        console.warn(`⚠️ Request failed. Retrying... (${retriesLeft} left)`);
        return this.request<T>(endpoint, options, retriesLeft - 1);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // --- Convenience Methods ---

  get<T = any>(endpoint: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  post<T = any>(endpoint: string, body?: unknown, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'POST', body });
  }

  put<T = any>(endpoint: string, body?: unknown, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'PUT', body });
  }

  patch<T = any>(endpoint: string, body?: unknown, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'PATCH', body });
  }

  delete<T = any>(endpoint: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}