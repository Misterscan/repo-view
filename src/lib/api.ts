function isHtmlResponse(text: string) {
  const trimmed = text.trimStart().toLowerCase();
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html');
}

function buildNonJsonError(text: string) {
  if (isHtmlResponse(text)) {
    return 'API returned HTML instead of JSON. Restart the backend/dev server and verify the /api route is available.';
  }

  const preview = text.replace(/\s+/g, ' ').trim().slice(0, 180);
  return preview ? `API returned a non-JSON response: ${preview}` : 'API returned an empty non-JSON response.';
}

export async function readApiJson<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!text.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(buildNonJsonError(text));
  }
}

export async function readApiResult<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = await readApiJson<T>(response);
  if (!response.ok) {
    throw new Error((data as { error?: string } | null | undefined)?.error || fallbackMessage);
  }
  return data;
}

export async function readApiError(response: Response, fallbackMessage: string): Promise<never> {
  try {
    const data = await readApiJson<{ error?: string }>(response);
    throw new Error(data?.error || fallbackMessage);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(fallbackMessage);
  }
}