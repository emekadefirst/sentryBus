export interface FetchClientConfig {
  headers?: Record<string, string>;
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

export interface ApiResponse<T = any> {
  ok: boolean;
  status: number;
  data: T;
  headers: Headers;
}