'use client'

import { useActionState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { ChannelAccount } from '@/modules/distribution'
import { registerManualChannel } from '../../../../actions/distribution'
import { Spinner } from '../../../../_components/spinner'

type ManualActionState = { error?: string; success?: string }

export function ManualChannelForm({
  productId,
  account,
}: {
  productId: string
  account?: ChannelAccount
}) {
  const router = useRouter()
  const action = useCallback(
    async (_prev: ManualActionState, formData: FormData): Promise<ManualActionState> => {
      const pageName = String(formData.get('pageName') ?? '').trim()
      const pageUrl = String(formData.get('pageUrl') ?? '').trim() || undefined

      if (!pageName) return { error: 'Nome da página é obrigatório.' }

      try {
        const result = await registerManualChannel(productId, 'linkedin', { pageName, pageUrl })
        if ('error' in result) return { error: result.error }
        return { success: 'Cadastro manual salvo.' }
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Não foi possível salvar o cadastro.' }
      }
    },
    [productId],
  )
  const [state, formAction, pending] = useActionState<ManualActionState, FormData>(action, {})
  const refreshedSuccess = useRef<string | null>(null)

  useEffect(() => {
    if (state.success && refreshedSuccess.current !== state.success) {
      refreshedSuccess.current = state.success
      router.refresh()
    }
  }, [router, state.success])

  const initialPageName = account?.displayName || account?.handle || ''

  return (
    <form action={formAction} className="border-line space-y-3 rounded-md border p-4">
      <div>
        <p className="text-sm font-medium">
          {account ? 'Editar cadastro manual' : 'Cadastrar canal manual'}
        </p>
        <p className="text-ink-soft mt-1 text-xs">
          O GrowthOS prepara o texto e o link rastreado; você cola e publica no LinkedIn.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="manual-page-name">Nome da página *</label>
          <input
            id="manual-page-name"
            name="pageName"
            defaultValue={initialPageName}
            required
            placeholder="Minha página no LinkedIn"
            className="input"
          />
        </div>

        <div className="field">
          <label htmlFor="manual-page-url">URL da página (opcional)</label>
          <input
            id="manual-page-url"
            name="pageUrl"
            type="url"
            defaultValue={account?.pageUrl ?? ''}
            placeholder="https://www.linkedin.com/company/..."
            className="input"
          />
        </div>
      </div>

      {state.error && <p className="text-danger text-xs" role="alert">{state.error}</p>}
      {state.success && <p className="text-ok text-xs" role="status">{state.success}</p>}

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending && <Spinner size="xs" />}
        {pending ? 'Salvando…' : account ? 'Salvar cadastro' : 'Cadastrar LinkedIn manual'}
      </button>

    </form>
  )
}
