async function parseErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const data = await response.json().catch(() => null);
    if (data && typeof data.error === 'string' && data.error.trim()) {
      return data.error;
    }
  } else {
    const text = await response.text().catch(() => '');
    if (text.trim()) {
      return text.trim();
    }
  }

  return fallbackMessage;
}

export async function ensureOk(response: Response, fallbackMessage: string): Promise<Response> {
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, fallbackMessage));
  }
  return response;
}

export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit, fallbackMessage: string = 'Request failed'): Promise<T> {
  const response = await fetch(input, init);
  await ensureOk(response, fallbackMessage);
  return response.json();
}

export async function fetchOk(input: RequestInfo | URL, init?: RequestInit, fallbackMessage: string = 'Request failed'): Promise<Response> {
  const response = await fetch(input, init);
  return ensureOk(response, fallbackMessage);
}
