'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  House,
  SquaresFour,
  Target,
  ShieldCheck,
  Users,
  Megaphone,
  Browser,
  Kanban,
  Broadcast,
  ListBullets,
  ChartBar,
  Lightbulb,
  Flask,
  Gear,
  CaretDown,
  List,
  X,
} from '@phosphor-icons/react'
import { toggleGlobalKillSwitch } from '../actions/distribution'
import { Spinner } from './spinner'

export interface SidebarProduct {
  id: string
  name: string
  domain: string | null
  stage: 'idea' | 'validating' | 'building' | 'launched'
}

const STAGE_LABEL: Record<SidebarProduct['stage'], string> = {
  idea: '1/4 · ideia',
  validating: '2/4 · validando',
  building: '3/4 · construindo',
  launched: '4/4 · lançado',
}

// Ordem segue a dependência real de uso, não ordem alfabética nem de implementação: canal e
// landing precisam existir ANTES de validar (validar sem canal publicando e sem pra onde mandar
// tráfego não mede nada), por isso vêm antes de Validação aqui.
const PRODUCT_SECTIONS = [
  { key: 'profile', label: 'Perfil', href: '', Icon: Target },
  { key: 'channels', label: 'Canais', href: '/channels', Icon: Broadcast },
  { key: 'landing', label: 'Landing', href: '/landing', Icon: Browser },
  { key: 'validation', label: 'Validação', href: '/validation', Icon: ShieldCheck },
  { key: 'audiences', label: 'Audiências', href: '/audiences', Icon: Users },
  { key: 'campaigns', label: 'Campanhas', href: '/campaigns', Icon: Megaphone },
  { key: 'content', label: 'Conteúdo', href: '/content', Icon: Kanban },
  { key: 'publications', label: 'Publicações', href: '/publications', Icon: ListBullets },
  { key: 'analytics', label: 'Analytics', href: '/analytics', Icon: ChartBar },
  { key: 'insights', label: 'Insights', href: '/insights', Icon: Lightbulb },
  { key: 'experiments', label: 'Experimentos', href: '/experiments', Icon: Flask },
  { key: 'settings', label: 'Configurações', href: '/settings/tracking', Icon: Gear },
] as const

/** Extrai `productId` e a seção ativa da URL — evita cada página precisar declarar `active="..."`. */
function useActiveSection(): { productId: string | null; section: string } {
  const pathname = usePathname()
  const match = pathname.match(/^\/products\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?/)
  if (!match) return { productId: null, section: '' }
  const [, productId, sub] = match
  if (productId === 'new') return { productId: null, section: '' }
  if (!sub) return { productId: productId!, section: 'profile' }
  if (sub === 'settings') return { productId: productId!, section: 'settings' }
  return { productId: productId!, section: sub }
}

export interface SidebarSectionAvailability {
  available: boolean
  reason?: string
}

export function Sidebar({
  products,
  currentProduct,
  automationActive,
  userEmail,
  signOutSlot,
  sectionAvailability,
  manualPendingByProduct,
}: {
  products: SidebarProduct[]
  currentProduct: SidebarProduct | null
  automationActive: boolean
  userEmail: string
  /** `<SignOutButton />` renderizado pelo Server Component pai — Client Component não pode
   *  importar/renderizar um componente com Server Action embutida diretamente. */
  signOutSlot: React.ReactNode
  /** Contagem lida pelo backend B5; zero/ausente não exibe badge. */
  manualPendingByProduct?: Record<string, number>
  /** Seções sem precondição/dado ainda ficam esmaecidas, nunca escondidas. Sem regra = disponível. */
  sectionAvailability?: Partial<Record<string, SidebarSectionAvailability>>
}) {
  const pathname = usePathname()
  const { productId, section } = useActiveSection()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [mobileOpen, setMobileOpen] = useState(false)

  const topActive = pathname === '/' ? 'painel' : pathname.startsWith('/products') && !productId ? 'produtos' : null

  function toggleAutomation() {
    const nextKillSwitch = automationActive
    if (
      nextKillSwitch &&
      !confirm('Ativar kill switch global? Nenhum post será publicado em nenhum canal até você desativar.')
    ) {
      return
    }
    startTransition(async () => {
      await toggleGlobalKillSwitch(nextKillSwitch)
      router.refresh()
    })
  }

  return (
    <aside className="sidebar-shell border-line relative z-30 flex w-full flex-none flex-col gap-3 border-b p-3 lg:sticky lg:top-0 lg:h-screen lg:w-[214px] lg:gap-4 lg:border-r lg:border-b-0">
      <div className="flex min-h-11 items-center justify-between">
        <Link href="/" className="flex min-h-11 items-center gap-2 px-1.5">
          <span className="border-accent block h-[18px] w-[18px] rounded-[5px] border-[1.5px]" />
          <span className="text-[15px] leading-none font-medium tracking-tight">
            Growth<span className="text-accent">OS</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          aria-expanded={mobileOpen}
          aria-controls="growthos-sidebar-navigation"
          aria-label={mobileOpen ? 'Fechar navegação' : 'Abrir navegação'}
          className="inline-flex size-11 items-center justify-center rounded-md lg:hidden"
        >
          {mobileOpen ? <X aria-hidden size={20} /> : <List aria-hidden size={20} />}
        </button>
      </div>

      <div
        id="growthos-sidebar-navigation"
        onClickCapture={(event) => {
          if ((event.target as Element).closest('a')) setMobileOpen(false)
        }}
        className={`${mobileOpen ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col gap-4 lg:flex`}
      >

      <nav className="grid gap-px">
        <SidebarLink href="/" active={topActive === 'painel'} Icon={House}>
          Painel
        </SidebarLink>
        <SidebarLink href="/products" active={topActive === 'produtos'} Icon={SquaresFour}>
          Produtos
        </SidebarLink>
      </nav>

      <div className="bg-line h-px" />

      <div>
        <div className="label-xs mb-2 px-2">Produto</div>
        {currentProduct ? (
          <details className="group relative">
            <summary className="border-line hover:border-ink-soft/50 flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md border px-2 py-2 text-sm marker:content-none [&::-webkit-details-marker]:hidden">
              <span className="bg-ok block h-1.5 w-1.5 flex-none rounded-full" />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate">{currentProduct.name}</span>
                <span className="text-ink-faint font-mono text-[9.5px] leading-none">
                  {STAGE_LABEL[currentProduct.stage]}
                </span>
              </span>
              <CaretDown size={12} className="text-ink-faint flex-none" />
            </summary>
            <div className="bg-panel border-line elev-sm absolute top-full left-0 z-20 mt-1 w-full rounded-md border p-1 shadow-lg">
              {products
                .filter((p) => p.id !== currentProduct.id)
                .map((p) => (
                  <Link
                    key={p.id}
                    href={`/products/${p.id}`}
                    className="hover:bg-accent-soft/40 block truncate rounded px-2 py-1.5 text-sm"
                  >
                    {p.name}
                  </Link>
                ))}
              <Link
                href="/products"
                className="text-accent hover:bg-accent-soft/40 block rounded px-2 py-1.5 text-sm"
              >
                Ver todos os produtos →
              </Link>
            </div>
          </details>
        ) : (
          <Link
            href="/products"
            className="border-line text-ink-faint hover:text-ink flex min-h-11 items-center gap-2 rounded-md border border-dashed px-2 py-2 text-sm"
          >
            Selecionar produto
          </Link>
        )}
      </div>

      {currentProduct && (
        <nav className="-mt-1 grid gap-px">
          {PRODUCT_SECTIONS.map((item) => (
            <SidebarLink
              key={item.key}
              href={`/products/${currentProduct.id}${item.href}`}
              active={section === item.key}
              Icon={item.Icon}
              available={sectionAvailability?.[item.key]?.available ?? true}
              reason={sectionAvailability?.[item.key]?.reason}
              badge={item.key === 'publications' ? manualPendingByProduct?.[currentProduct.id] : undefined}
            >
              {item.label}
            </SidebarLink>
          ))}
        </nav>
      )}

      <div className="mt-auto grid gap-2">
        <button
          type="button"
          onClick={toggleAutomation}
          disabled={pending}
          className="border-line flex min-h-11 items-center gap-2 rounded-md border px-2 py-2 text-left disabled:opacity-60"
        >
          {pending ? (
            <Spinner size="xs" />
          ) : (
            <span className={`block h-1.5 w-1.5 flex-none rounded-full ${automationActive ? 'bg-ok' : 'bg-ink-faint'}`} />
          )}
          <span className="flex-1 text-xs">{pending ? 'Atualizando…' : 'Automação ativa'}</span>
          <span
            className={`relative block h-[15px] w-[26px] flex-none rounded-full transition-colors ${
              automationActive ? 'bg-ok/40' : 'bg-line'
            }`}
          >
            <span
              className={`bg-ink absolute top-0.5 h-[11px] w-[11px] rounded-full transition-all ${
                automationActive ? 'right-0.5' : 'left-0.5'
              }`}
            />
          </span>
        </button>
        <div className="flex items-center gap-2 px-1">
          <span className="text-ink-faint flex-1 truncate text-[11px]">{userEmail}</span>
          {signOutSlot}
        </div>
      </div>
      </div>
    </aside>
  )
}

function SidebarLink({
  href,
  active,
  Icon,
  children,
  available = true,
  reason,
  badge,
}: {
  href: string
  active: boolean
  Icon: React.ComponentType<{ size?: number; weight?: 'regular' | 'bold' }>
  children: React.ReactNode
  /** Seção sem precondição/dado ainda — continua navegável, só fica esmaecida com um `title`. */
  available?: boolean
  reason?: string
  badge?: number
}) {
  return (
    <Link
      href={href as Route}
      title={!available ? reason : undefined}
      className={[
        'flex min-h-11 items-center gap-2.5 rounded-[6px] px-2 py-2 text-sm transition-colors',
        active
          ? 'bg-accent-soft text-accent'
          : available
            ? 'text-ink-soft hover:text-ink'
            : 'text-ink-faint opacity-60 hover:opacity-100',
      ].join(' ')}
    >
      <Icon size={15} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {badge && badge > 0 ? (
        <span className="bg-warn-soft text-warn rounded px-1.5 py-0.5 font-mono text-[10px]" aria-label={`${badge} esperando você`}>
          {badge}
        </span>
      ) : null}
    </Link>
  )
}
