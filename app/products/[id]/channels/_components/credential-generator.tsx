'use client'

import { useActionState, useState } from 'react'
import { saveProductEmailAction } from '../../../../actions/products'
import { Spinner } from '../../../../_components/spinner'

const PASSWORD_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+'

function slugifyLocalPart(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove acentos
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 20) || 'produto'
  )
}

/** 3 dígitos aleatórios — reduz a chance de colisão com nome já registrado em provedor comum. */
function randomSuffix(): string {
  const bytes = new Uint32Array(3)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b % 10).join('')
}

function generatePassword(length = 24): string {
  const bytes = new Uint32Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => PASSWORD_CHARSET[b % PASSWORD_CHARSET.length]).join('')
}

/**
 * Gera sugestão de e-mail e senha forte pra uma conta nova (Bluesky, provedor de e-mail, etc.) —
 * tudo no navegador, na hora do clique. A senha nunca é enviada nem salva em lugar nenhum: é
 * sensível demais pra guardar aqui (é a chave de recuperação de tudo mais) — o gerenciador de senha
 * de confiança do usuário é o lugar certo pra isso. O e-mail em si não é segredo (é só um endereço,
 * mesma categoria que o handle do Bluesky já salvo), então dá pra guardar — depois de completar
 * com o provedor escolhido, o "Salvar" grava só o endereço, nunca a senha.
 */
export function CredentialGenerator({
  productId,
  productName,
  savedEmail,
}: {
  productId: string
  productName: string
  savedEmail: string | null
}) {
  const [email, setEmail] = useState(savedEmail ?? '')
  const [password, setPassword] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<'email' | 'password' | null>(null)
  const [saveState, saveAction, savePending] = useActionState(saveProductEmailAction, {})

  function generate() {
    setEmail(`${slugifyLocalPart(productName)}${randomSuffix()}`)
    setPassword(generatePassword())
  }

  function copy(field: 'email' | 'password', value: string) {
    navigator.clipboard.writeText(value)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  return (
    <div className="border-line space-y-3 rounded-md border p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Gerador de credenciais pra uma conta nova</p>
          <p className="text-ink-faint text-xs">
            Sugestão de usuário + senha forte, gerados agora no seu navegador. A senha nunca é
            salva; o e-mail, depois de completo, você pode salvar aqui.
          </p>
        </div>
        <button type="button" onClick={generate} className="btn btn-secondary shrink-0">
          {password ? 'Gerar de novo' : 'Gerar credenciais'}
        </button>
      </div>

      <div className="field">
        <label htmlFor="cred-email">
          E-mail (complete com @ e o provedor escolhido antes de salvar)
        </label>
        <div className="flex gap-2">
          <input
            id="cred-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="usuario@provedor.com"
            className="input flex-1"
            style={{ fontFamily: 'var(--font-mono)' }}
          />
          <button
            type="button"
            onClick={() => copy('email', email)}
            disabled={!email}
            className="btn btn-secondary shrink-0"
          >
            {copiedField === 'email' ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
        <form action={saveAction} className="mt-1.5 flex items-center gap-2">
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="email" value={email} />
          <button type="submit" disabled={savePending || !email} className="btn btn-primary">
            {savePending && <Spinner size="xs" />}
            {savePending ? 'Salvando…' : 'Salvar'}
          </button>
          {saveState.success && <span className="text-ok text-xs">{saveState.success}</span>}
          {saveState.error && <span className="text-danger text-xs">{saveState.error}</span>}
        </form>
        <p className="text-ink-faint mt-1 text-xs">
          Salvo aparece em Perfil. É só o endereço — nunca a senha.
        </p>
      </div>

      {password && (
        <div className="field">
          <label htmlFor="cred-password">Senha aleatória forte</label>
          <div className="flex gap-2">
            <input
              id="cred-password"
              readOnly
              value={password}
              onFocus={(e) => e.currentTarget.select()}
              className="input flex-1"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <button
              type="button"
              onClick={() => copy('password', password)}
              className="btn btn-secondary shrink-0"
            >
              {copiedField === 'password' ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
          <p className="text-danger mt-1 text-xs">
            Copie agora pro seu gerenciador de senha de confiança — ela some se você sair ou
            atualizar esta página, e não tem como recuperá-la depois.
          </p>
        </div>
      )}
    </div>
  )
}
