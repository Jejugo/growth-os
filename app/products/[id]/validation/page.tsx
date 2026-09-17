import { notFound } from 'next/navigation'
import { requireUser } from '@/server/guard'
import { findProduct } from '@/modules/products'
import {
  findLatestBrief,
  findRunningValidation,
  listValidations,
  getValidationMetrics,
  getVariantPerformance,
  findLatestLandingPage,
  listWaitlistSignups,
} from '@/modules/validation'
import type { WaitlistSignup } from '@/modules/validation'
import { listExperimentVariants } from '@/modules/content'
import { ValidationClient } from './_components/validation-client'
import { OperationsHeader } from '../_components/operations-header'

export const dynamic = 'force-dynamic'

export default async function ValidationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser()
  const { id } = await params

  const product = await findProduct(id)
  if (!product) notFound()

  const [brief, running, history, landingPage] = await Promise.all([
    findLatestBrief(id),
    findRunningValidation(id),
    listValidations(id),
    findLatestLandingPage(id),
  ])

  let liveMetrics: { visitors: number; signups: number; activations: number; paid: number } | null = null
  let waitlistSignups: WaitlistSignup[] = []
  let variants: Array<{
    variantId: string
    label: string
    name: string
    description: string | null
    clicks: number
    signups: number
    activations: number
    paid: number
  }> = []

  if (running) {
    const windowStart = running.startedAt ?? running.createdAt
    const windowEnd = new Date()

    ;[liveMetrics, waitlistSignups] = await Promise.all([
      getValidationMetrics(id, windowStart, windowEnd),
      listWaitlistSignups(id, { since: windowStart, until: windowEnd }),
    ])

    if (running.experimentId) {
      const [experimentVariants, performance] = await Promise.all([
        listExperimentVariants(running.experimentId),
        getVariantPerformance(running.experimentId),
      ])
      const perfById = new Map(performance.map((p) => [p.variantId, p]))
      variants = experimentVariants.map((v) => ({
        variantId: v.id,
        label: v.label,
        name: v.name,
        description: v.description,
        clicks: perfById.get(v.id)?.clicks ?? 0,
        signups: perfById.get(v.id)?.signups ?? 0,
        activations: perfById.get(v.id)?.activations ?? 0,
        paid: perfById.get(v.id)?.paid ?? 0,
      }))
    }
  }

  const validationDue = !!running?.endsAt && new Date(running.endsAt).getTime() <= new Date().getTime()
  const signupRate = (liveMetrics?.visitors ?? 0) > 0
    ? (liveMetrics?.signups ?? 0) / (liveMetrics?.visitors ?? 1)
    : 0
  const criteriaMet = running
    ? [
        (liveMetrics?.visitors ?? 0) >= running.minVisitors,
        (liveMetrics?.signups ?? 0) >= running.minSignups,
        signupRate >= Number(running.minSignupRate),
        (liveMetrics?.activations ?? 0) + (liveMetrics?.paid ?? 0) >= running.minStrongSignals,
      ].filter(Boolean).length
    : 0

  const attention = !brief
    ? 'Este produto não possui brief de ideia para iniciar a validação.'
    : validationDue
      ? 'O teste venceu e precisa ser concluído antes da próxima decisão.'
      : running
        ? `${criteriaMet} de 4 critérios atingidos; acompanhe o ritmo até o fim da janela.`
        : landingPage?.status !== 'ready'
          ? 'Publique uma landing antes de iniciar a validação.'
          : stageAllowsValidation(product.stage)
            ? 'A validação está pronta para ser iniciada.'
            : 'Nenhuma decisão de validação pendente neste estágio.'

  return (
    <div className="space-y-8">
      <OperationsHeader
        productId={id}
        productName={product.name}
        currentStep="validation"
        state={{
          label: validationDue ? 'Conclusão pendente' : running ? 'Em andamento' : brief ? 'Pronta para iniciar' : 'Indisponível',
          tone: validationDue ? 'warning' : running ? 'active' : brief ? 'neutral' : 'warning',
        }}
        attention={attention}
        nextAction={
          !brief
            ? { href: `/products/${id}`, label: 'Revisar perfil' }
            : landingPage?.status !== 'ready'
              ? { href: `/products/${id}/landing`, label: 'Preparar landing' }
              : { href: '#validation-workspace', label: running ? 'Acompanhar validação' : 'Iniciar validação' }
        }
      />

      <div id="validation-workspace" className="scroll-mt-4">
        <ValidationClient
          productId={id}
          stage={product.stage}
          brief={brief ?? null}
          running={running ?? null}
          history={history}
          liveMetrics={liveMetrics}
          waitlistSignups={waitlistSignups}
          variants={variants}
          landingPage={landingPage ?? null}
        />
      </div>
    </div>
  )
}

function stageAllowsValidation(stage: 'idea' | 'validating' | 'building' | 'launched'): boolean {
  return stage === 'idea' || stage === 'validating'
}
