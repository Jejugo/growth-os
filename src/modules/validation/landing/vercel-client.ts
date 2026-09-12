import { env } from '@/lib/env'

const VERCEL_API_BASE = 'https://api.vercel.com'

export class VercelApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'VercelApiError'
  }
}

function authHeaders(): Record<string, string> {
  const token = env().VERCEL_API_TOKEN
  if (!token) {
    throw new VercelApiError(
      'VERCEL_API_TOKEN não configurado — defina no .env para gerar landing pages automaticamente.',
      0,
    )
  }
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

function teamQuery(): string {
  const teamId = env().VERCEL_TEAM_ID
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : ''
}

export interface VercelDeployment {
  id: string
  url: string
  readyState: 'QUEUED' | 'BUILDING' | 'READY' | 'ERROR' | 'CANCELED' | string
}

export async function createDeployment(input: {
  projectName: string
  files: Array<{ file: string; data: string }>
}): Promise<VercelDeployment> {
  const res = await fetch(`${VERCEL_API_BASE}/v13/deployments${teamQuery()}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      name: input.projectName,
      files: input.files,
      target: 'production',
      projectSettings: { framework: null },
    }),
  })

  const body = await res.json()
  if (!res.ok) {
    throw new VercelApiError(
      `Falha ao criar deployment na Vercel: ${body?.error?.message ?? res.statusText}`,
      res.status,
    )
  }
  return { id: body.id, url: body.url, readyState: body.readyState }
}

/**
 * Projetos novos nascem com "Vercel Authentication" (SSO) ligado por padrão
 * nesta conta — o próprio dono vê a página, mas qualquer visitante anônimo
 * (o público real de uma landing de waitlist) cai numa tela de login do
 * Vercel em vez do conteúdo. Como o propósito da página é ser pública, isso
 * não é um bypass de automação — é um requisito de produto.
 */
export async function disableDeploymentProtection(projectName: string): Promise<void> {
  const res = await fetch(`${VERCEL_API_BASE}/v9/projects/${projectName}${teamQuery()}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ ssoProtection: null }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new VercelApiError(
      `Falha ao desativar a proteção do projeto na Vercel: ${body?.error?.message ?? res.statusText}`,
      res.status,
    )
  }
}

export async function getDeployment(id: string): Promise<VercelDeployment> {
  const res = await fetch(`${VERCEL_API_BASE}/v13/deployments/${id}${teamQuery()}`, {
    headers: authHeaders(),
  })
  const body = await res.json()
  if (!res.ok) {
    throw new VercelApiError(
      `Falha ao consultar deployment na Vercel: ${body?.error?.message ?? res.statusText}`,
      res.status,
    )
  }
  return { id: body.id, url: body.url, readyState: body.readyState }
}

/**
 * A Vercel atribui ao projeto um alias "limpo" (ex. `meu-projeto.vercel.app`), separado da URL
 * específica do deployment (que carrega um hash e o nome do time/conta, ex.
 * `meu-projeto-x7f3ab-time.vercel.app`) — essa lista é o jeito documentado de descobrir qual é.
 */
export async function listDeploymentAliases(deploymentId: string): Promise<string[]> {
  const res = await fetch(`${VERCEL_API_BASE}/v2/deployments/${deploymentId}/aliases${teamQuery()}`, {
    headers: authHeaders(),
  })
  const body = await res.json()
  if (!res.ok) {
    throw new VercelApiError(
      `Falha ao consultar aliases do deployment na Vercel: ${body?.error?.message ?? res.statusText}`,
      res.status,
    )
  }
  return ((body.aliases ?? []) as Array<{ alias: string }>).map((a) => a.alias)
}

/** Poll até `READY` — deploy estático costuma levar poucos segundos, mas nunca é instantâneo. */
export async function waitForDeploymentReady(
  id: string,
  { timeoutMs = 45_000, intervalMs = 2_000 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<VercelDeployment> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const deployment = await getDeployment(id)
    if (deployment.readyState === 'READY') return deployment
    if (deployment.readyState === 'ERROR' || deployment.readyState === 'CANCELED') {
      throw new VercelApiError(`Deployment terminou com estado ${deployment.readyState}.`, 0)
    }
    if (Date.now() > deadline) {
      throw new VercelApiError(
        `Deployment não ficou pronto em ${timeoutMs}ms (estado: ${deployment.readyState}).`,
        0,
      )
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}
