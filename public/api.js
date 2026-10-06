// Cliente da API JSON.

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function req(method, url, body) {
  let res;
  try {
    res = await fetch(`/api${url}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new ApiError('Sem conexão com o servidor.', 0, null);
  }
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json().catch(() => null) : await res.text();
  if (!res.ok) {
    if (res.status === 401 && data?.precisaLogin) window.dispatchEvent(new CustomEvent('precisa-login'));
    throw new ApiError((data && data.erro) || `Erro ${res.status}`, res.status, data);
  }
  return data;
}

export const api = {
  config: () => req('GET', '/config'),
  login: (codigo) => req('POST', '/login', { codigo }),
  sugestoes: (n = 6) => req('GET', `/temas/sugestoes?n=${n}`),
  criar: (cfg) => req('POST', '/provas', cfg),
  listar: () => req('GET', '/provas'),
  meta: (id) => req('GET', `/provas/${id}`),
  prova: (id) => req('GET', `/provas/${id}/prova`),
  iniciar: (id) => req('POST', `/provas/${id}/iniciar`),
  salvar: (id, dados) => req('PUT', `/provas/${id}/sessao`, dados),
  finalizar: (id) => req('POST', `/provas/${id}/finalizar`),
  relatorio: (id) => req('GET', `/provas/${id}/relatorio.md`),
  retry: (id) => req('POST', `/provas/${id}/retry`),
  apagar: (id) => req('DELETE', `/provas/${id}`),
  /** Envio garantido ao fechar a aba (text/plain evita preflight). */
  beacon(id, dados) {
    try {
      const blob = new Blob([JSON.stringify(dados)], { type: 'text/plain' });
      return navigator.sendBeacon(`/api/provas/${id}/sessao`, blob);
    } catch {
      return false;
    }
  },
};
