let token = localStorage.getItem('token');

export const setToken = (t) => {
  token = t;
  if (t) localStorage.setItem('token', t);
  else localStorage.removeItem('token');
};
export const hasToken = () => !!token;

export async function api(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) {
      setToken(null);
      location.reload();
    }
    throw new Error(data.error ?? `エラー (${res.status})`);
  }
  return data;
}

export const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
