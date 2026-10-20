export async function api<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  const response = await fetch(`/api/pm/${path}`, { method, credentials: 'same-origin', ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const result = await response.json() as T & {error?:string};
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result as T;
}
