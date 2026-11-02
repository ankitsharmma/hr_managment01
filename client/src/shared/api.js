export async function api(url, method = 'GET', body) {
  const isForm = body instanceof FormData;
  const response = await fetch('/api' + url, {
    method,
    headers: body && !isForm ? {
      'Content-Type': 'application/json'
    } : {},
    body: body ? isForm ? body : JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({
    error: 'Unexpected server response'
  }));
  if (!response.ok) throw Error(data.error || 'Request failed');
  return data;
}

export function download(name, data, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([data], {
    type
  }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const csv = rows => rows.map(row => row.map(value => '"' + String(value ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n');
