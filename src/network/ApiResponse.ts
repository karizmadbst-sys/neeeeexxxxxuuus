export interface ApiRequestErrorDetails {
  status: number;
  code?: string;
  isNetworkOrGatewayError?: boolean;
  isHtmlResponse?: boolean;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly isNetworkOrGatewayError: boolean;
  readonly isHtmlResponse: boolean;

  constructor(message: string, details: ApiRequestErrorDetails) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = details.status;
    this.code = details.code;
    this.isNetworkOrGatewayError = Boolean(details.isNetworkOrGatewayError);
    this.isHtmlResponse = Boolean(details.isHtmlResponse);
  }
}

export function isBackendReachabilityError(err: unknown): boolean {
  if (err instanceof ApiRequestError) {
    return err.isNetworkOrGatewayError;
  }
  if (err instanceof TypeError) {
    return true;
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('failed to fetch') ||
      msg.includes('networkerror') ||
      msg.includes('load failed') ||
      msg.includes('network request failed')
    );
  }
  return false;
}

function buildHtmlGatewayError(status: number, bodyText: string, fallbackMessage?: string): ApiRequestError {
  const lower = bodyText.toLowerCase();
  const isCookieGate =
    lower.includes('__cookie_check') ||
    lower.includes('cookie_check') ||
    lower.includes('aistudio');

  if (isCookieGate) {
    return new ApiRequestError(
      'The backend URL redirected to a browser security/cookie check page instead of JSON. Ensure the backend service is publicly deployed and VITE_BACKEND_URL points to the active server.',
      {
        status: status || 502,
        code: 'BACKEND_AUTH_PROXY_HTML',
        isNetworkOrGatewayError: true,
        isHtmlResponse: true,
      },
    );
  }

  if (status === 502 || status === 503 || status === 504) {
    return new ApiRequestError(
      `The authentication backend service is currently unavailable (HTTP ${status}). Verify the backend server is deployed and running.`,
      {
        status,
        code: 'BACKEND_UNAVAILABLE',
        isNetworkOrGatewayError: true,
        isHtmlResponse: true,
      },
    );
  }

  return new ApiRequestError(
    fallbackMessage ||
      `Server returned an HTML page instead of JSON (HTTP ${status || 'unknown'}). Check that the API route and backend URL are configured correctly.`,
    {
      status,
      code: 'BACKEND_HTML_ERROR',
      isNetworkOrGatewayError: true,
      isHtmlResponse: true,
    },
  );
}

export async function parseJsonResponse<T>(
  res: Response,
  fallbackErrorMessage?: string,
): Promise<T> {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const rawText = await res.text();
  const trimmed = rawText.trim();

  if (contentType.includes('text/html') || trimmed.startsWith('<')) {
    throw buildHtmlGatewayError(res.status, trimmed, fallbackErrorMessage);
  }

  if (!trimmed) {
    if (!res.ok) {
      throw new ApiRequestError(
        fallbackErrorMessage || `Server returned an empty error response (HTTP ${res.status}).`,
        {
          status: res.status,
          code: 'EMPTY_ERROR_RESPONSE',
          isNetworkOrGatewayError: res.status >= 500 || res.status === 0,
          isHtmlResponse: false,
        },
      );
    }
    return {} as T;
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new ApiRequestError(
      fallbackErrorMessage ||
        `Server returned an invalid non-JSON response (HTTP ${res.status}).`,
      {
        status: res.status,
        code: 'INVALID_JSON_RESPONSE',
        isNetworkOrGatewayError: res.status >= 500 || res.status === 0,
        isHtmlResponse: false,
      },
    );
  }
}

export async function fetchApiJson<T>(
  url: string,
  init?: RequestInit,
  fallbackErrorMessage?: string,
): Promise<{ res: Response; data: T }> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiRequestError(
      'Unable to reach the NEXUS ROYALE server. Check your internet connection or verify that the backend server is running and accessible.',
      {
        status: 0,
        code: 'NETWORK_ERROR',
        isNetworkOrGatewayError: true,
        isHtmlResponse: false,
      },
    );
  }

  const data = await parseJsonResponse<T>(res, fallbackErrorMessage);
  return { res, data };
}
