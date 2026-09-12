import { notFound } from 'next/navigation'
import { requireUser } from '@/server/guard'
import { findProduct } from '@/modules/products/repo'
import {
  listChannelAccounts,
  listAutomationPolicies,
  getSystemConfig,
} from '@/modules/distribution/repo'
import { ConnectBlueskyForm } from './_components/connect-bluesky-form'
import { ChannelAccountCard } from './_components/channel-account-card'
import { AutomationPolicyForm } from './_components/automation-policy-form'
import { GlobalKillSwitchBanner } from './_components/global-kill-switch-banner'
import { CredentialGenerator } from './_components/credential-generator'

export default async function ChannelsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser()
  const { id } = await params
  const product = await findProduct(id)
  if (!product) notFound()

  const [accounts, policies, config] = await Promise.all([
    listChannelAccounts(id),
    listAutomationPolicies(id),
    getSystemConfig(),
  ])

  const policyMap = Object.fromEntries(policies.map((p) => [p.channel, p]))

  const channels = ['bluesky', 'linkedin', 'reddit'] as const

  return (
    <div className="space-y-8">

      {config.globalKillSwitch && (
        <GlobalKillSwitchBanner />
      )}

      <div>
        <h1 className="text-xl font-semibold">{product.name} — Canais</h1>
        <p className="text-ink-soft mt-1 text-sm">
          Contas conectadas, políticas de automação e kill switches por canal.
        </p>
      </div>

      <CredentialGenerator productId={id} productName={product.name} savedEmail={product.email} />

      {channels.map((channel) => {
        const channelAccounts = accounts.filter((a) => a.channel === channel)
        const policy = policyMap[channel]

        return (
          <section
            key={channel}
            className={`space-y-4 rounded-md border p-5 ${
              policy?.killSwitch ? 'border-danger/35 bg-danger-soft' : 'border-line'
            }`}
          >
            <div className="flex items-center gap-2">
              <h2 className="font-medium capitalize">{channel}</h2>
              {policy?.killSwitch && (
                <span className="tag font-mono" style={{ color: 'var(--color-danger)', border: '1px solid color-mix(in srgb, var(--color-danger) 45%, transparent)' }}>
                  kill switch ativo
                </span>
              )}
            </div>

            {channelAccounts.length > 0 ? (
              <div className="space-y-2">
                {channelAccounts.map((account) => (
                  <ChannelAccountCard key={account.id} account={account} />
                ))}
              </div>
            ) : (
              <p className="text-ink-faint text-sm">Nenhuma conta conectada.</p>
            )}

            {channel === 'bluesky' && channelAccounts.length === 0 && (
              <div className="border-line bg-accent-soft/40 space-y-2 rounded-md border p-3 text-sm">
                <p className="font-medium">Antes de conectar: crie uma conta dedicada a este produto</p>
                <p className="text-ink-soft">
                  Não use sua conta pessoal — o que sai daqui é conteúdo autônomo, gerado e
                  publicado sem revisão sua a cada post. Use o gerador de credenciais acima pra
                  criar rápido um e-mail e uma senha dedicados, se ainda não tiver.
                </p>
                <ol className="text-ink-soft list-decimal space-y-1 pl-4">
                  <li>
                    Crie uma conta nova com nome, foto e bio do produto (não os seus):{' '}
                    <a
                      href="https://bsky.app"
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent underline"
                    >
                      bsky.app ↗
                    </a>
                  </li>
                  <li>
                    Já logado nessa conta nova, gere uma{' '}
                    <span className="font-mono">App Password</span> (nunca a senha principal) em{' '}
                    <a
                      href="https://bsky.app/settings/app-passwords"
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent underline"
                    >
                      Configurações → App Passwords ↗
                    </a>
                  </li>
                  <li>Cole o handle e essa senha de app no formulário abaixo.</li>
                </ol>
              </div>
            )}

            {channel === 'bluesky' && <ConnectBlueskyForm productId={id} />}

            <AutomationPolicyForm productId={id} channel={channel} policy={policy} />
          </section>
        )
      })}
    </div>
  )
}
