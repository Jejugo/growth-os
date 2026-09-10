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

            {channel === 'bluesky' && <ConnectBlueskyForm productId={id} />}

            <AutomationPolicyForm productId={id} channel={channel} policy={policy} />
          </section>
        )
      })}
    </div>
  )
}
