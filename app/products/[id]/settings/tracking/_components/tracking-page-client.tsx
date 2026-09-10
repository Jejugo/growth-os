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
        <div className="mb-3.5 flex items-center justify-between">
          <div>
            <h2 className="text-accent text-sm font-medium">Chaves de ingestão</h2>
            <p className="text-ink-soft mt-0.5 text-sm">
              Use para enviar eventos de conversão via API.
            </p>
          </div>
          <button onClick={handleCreate} disabled={isPending} className="btn btn-primary">
            {isPending ? 'Criando…' : 'Nova chave'}
          </button>
        </div>

        {/* Raw key — mostrada uma única vez */}
        {newRawKey && (
          <div className="border-ok/35 bg-ok-soft mb-4 space-y-2 rounded-md border p-4">
            <p className="text-ok text-sm font-medium">
              Chave criada. Copie agora — não será mostrada novamente.
            </p>
            <div className="flex items-center gap-2">
              <code className="border-line bg-surface flex-1 overflow-x-auto rounded-md border px-3 py-2 font-mono text-xs select-all">
                {newRawKey}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(newRawKey)
                }}
                className="btn btn-secondary shrink-0"
              >
                Copiar
              </button>
            </div>
            <button onClick={() => setNewRawKey(null)} className="btn btn-ghost">
              Já copiei — fechar
            </button>
          </div>
        )}

        {keys.length === 0 ? (
          <div className="border-line text-ink-soft rounded-md border border-dashed p-8 text-center text-sm">
            Nenhuma chave criada. Crie uma para começar a enviar eventos.
          </div>
        ) : (
          <div className="border-line divide-line divide-y overflow-hidden rounded-md border">
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
                    className={`tag font-mono ${key.revokedAt ? 'tag-neutral' : 'text-ok border border-ok/35'}`}
                  >
                    {key.revokedAt ? 'revogada' : 'ativa'}
                  </span>
                  {!key.revokedAt && (
                    <button onClick={() => handleRevoke(key.id)} className="btn btn-ghost">
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
        <h2 className="text-accent mb-2.5 text-sm font-medium">Integração</h2>
        <p className="text-ink-soft mb-4 text-sm">
          Envie eventos de conversão para o GrowthOS a partir do seu produto.
        </p>

        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-sm font-medium">Server-side (recomendado)</h3>
            <pre className="border-line text-ink-soft overflow-x-auto rounded-md border p-4 font-mono text-xs leading-relaxed">
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
            <pre className="border-line text-ink-soft overflow-x-auto rounded-md border p-4 font-mono text-xs leading-relaxed">
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
