'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createIngestKeyAction, revokeIngestKeyAction } from '../../../../../actions/attribution'
import type { IngestKey } from '@/modules/attribution/schema'

export function TrackingPageClient({
  productId,
  initialKeys,
}: {
  productId: string
  initialKeys: IngestKey[]
}) {
  const router = useRouter()
  const [keys, setKeys] = useState(initialKeys)
  const [newRawKey, setNewRawKey] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleCreate() {
    startTransition(async () => {
      const { key, rawKey } = await createIngestKeyAction(productId, 'Chave de ingestão')
      setKeys((prev) => [key, ...prev])
      setNewRawKey(rawKey)
    })
  }

  function handleRevoke(keyId: string) {
    if (!confirm('Revogar esta chave? Eventos enviados com ela passarão a ser rejeitados.')) return
    startTransition(async () => {
      await revokeIngestKeyAction(productId, keyId)
      router.refresh()
    })
  }

  return (
    <>
      {/* Chaves de ingestão */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Chaves de ingestão</h2>
            <p className="text-ink-soft mt-0.5 text-sm">
              Use para enviar eventos de conversão via API.
            </p>
          </div>
          <button
            onClick={handleCreate}
            disabled={isPending}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {isPending ? 'Criando…' : 'Nova chave'}
          </button>
        </div>

        {/* Raw key — mostrada uma única vez */}
        {newRawKey && (
          <div className="mb-4 rounded-lg border border-ok/40 bg-ok/5 p-4 space-y-2">
            <p className="text-sm font-medium text-ok">
              Chave criada. Copie agora — não será mostrada novamente.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded bg-surface px-3 py-2 font-mono text-xs text-ink select-all">
                {newRawKey}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(newRawKey)
                }}
                className="shrink-0 rounded border border-line px-3 py-2 text-xs text-ink-soft hover:text-ink"
              >
                Copiar
              </button>
            </div>
            <button
              onClick={() => setNewRawKey(null)}
              className="text-xs text-ink-faint hover:text-ink"
            >
              Já copiei — fechar
            </button>
          </div>
        )}

        {keys.length === 0 ? (
          <div className="panel text-ink-soft p-8 text-center text-sm">
            Nenhuma chave criada. Crie uma para começar a enviar eventos.
          </div>
        ) : (
          <div className="panel divide-y divide-border rounded-lg">
            {keys.map((key) => (
              <div key={key.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{key.name}</p>
                  <p className="text-ink-faint mt-0.5 font-mono text-xs">
                    {key.revokedAt ? (
                      <span className="text-danger">
                        Revogada em {new Date(key.revokedAt).toLocaleDateString('pt-BR')}
                      </span>
                    ) : key.lastUsedAt ? (
                      <span>Último uso: {new Date(key.lastUsedAt).toLocaleDateString('pt-BR')}</span>
                    ) : (
                      <span>Nunca usada</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={[
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      key.revokedAt
                        ? 'bg-surface-dim text-ink-faint'
                        : 'bg-ok/10 text-ok',
                    ].join(' ')}
                  >
                    {key.revokedAt ? 'revogada' : 'ativa'}
                  </span>
                  {!key.revokedAt && (
                    <button
                      onClick={() => handleRevoke(key.id)}
                      className="text-ink-soft text-xs hover:text-danger"
                    >
                      Revogar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Snippet de integração */}
      <section>
        <h2 className="mb-3 text-base font-semibold">Integração</h2>
        <p className="text-ink-soft mb-4 text-sm">
          Envie eventos de conversão para o GrowthOS a partir do seu produto.
        </p>

        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-sm font-medium">Server-side (recomendado)</h3>
            <pre className="panel overflow-x-auto rounded-lg p-4 font-mono text-xs leading-relaxed text-ink-soft">
{`POST https://seu-dominio.com/api/events
Authorization: Bearer gik_<sua-chave>
Content-Type: application/json

{
  "eventType": "signup",
  "vid": "<cookie gos_vid do visitante>",
  "externalUserId": "<id do usuário no seu sistema>",
  "dedupeKey": "signup:<userId>",
  "metadata": {}
}`}
            </pre>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium">JavaScript (client-side)</h3>
            <pre className="panel overflow-x-auto rounded-lg p-4 font-mono text-xs leading-relaxed text-ink-soft">
{`// Leia o cookie gos_vid do visitante
const vid = document.cookie
  .split('; ')
  .find(r => r.startsWith('gos_vid='))
  ?.split('=')[1]

await fetch('https://seu-dominio.com/api/events', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer gik_<sua-chave>',
  },
  body: JSON.stringify({
    eventType: 'signup',
    vid,
    externalUserId: currentUser.id,
    dedupeKey: \`signup:\${currentUser.id}\`,
  }),
})`}
            </pre>
          </div>
        </div>
      </section>
    </>
  )
}
