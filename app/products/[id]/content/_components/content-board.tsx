'use client'

import Link from 'next/link'
import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import { MagnifyingGlass } from '@phosphor-icons/react'
import type { ContentIdea, SocialPost } from '@/modules/content'
import { ANGLE_LABELS, type RiskReview } from '@/modules/content/types'
import { approvePostsAction, type ActionState } from '../../../../actions/content'
import { Spinner } from '../../../../_components/spinner'

type BoardFilter =
  | 'attention'
  | 'all'
  | 'ideas'
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'archived'

type ColumnKey = Exclude<BoardFilter, 'attention' | 'all'>

const COLUMNS: Array<{ key: ColumnKey; label: string; description: string }> = [
  { key: 'ideas', label: 'Ideias', description: 'Propostas ainda não usadas' },
  { key: 'draft', label: 'Rascunhos', description: 'Em preparação' },
  { key: 'pending_approval', label: 'Revisão', description: 'Aguardam sua decisão' },
  { key: 'approved', label: 'Prontos', description: 'Aprovados para publicar' },
  { key: 'scheduled', label: 'Agendados', description: 'Na fila de publicação' },
  { key: 'published', label: 'Publicados', description: 'Já distribuídos' },
  { key: 'archived', label: 'Arquivados', description: 'Rejeitados ou cancelados' },
]

const FILTER_LABELS: Array<{ value: BoardFilter; label: string }> = [
  { value: 'attention', label: 'Precisa de mim' },
  { value: 'all', label: 'Todos' },
  { value: 'ideas', label: 'Ideias' },
  { value: 'draft', label: 'Rascunhos' },
  { value: 'pending_approval', label: 'Revisão' },
  { value: 'approved', label: 'Prontos' },
  { value: 'scheduled', label: 'Agendados' },
  { value: 'published', label: 'Publicados' },
  { value: 'archived', label: 'Arquivados' },
]

function postColumn(post: SocialPost): ColumnKey {
  return post.status === 'rejected' || post.status === 'cancelled' ? 'archived' : post.status
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && !!target.closest('input, textarea, select, button, [contenteditable="true"]')
}

export function ContentBoard({
  productId,
  posts,
  ideas,
  metrics,
  campaigns,
  selectedPostId,
  initialStatus = 'attention',
  initialCampaignId = 'all',
}: {
  productId: string
  posts: SocialPost[]
  ideas: ContentIdea[]
  metrics: Record<string, { clicks: number; signups: number }>
  campaigns: Array<{ id: string; name: string }>
  selectedPostId?: string
  initialStatus?: string
  initialCampaignId?: string
}) {
  const validInitial = FILTER_LABELS.some((option) => option.value === initialStatus)
    ? (initialStatus as BoardFilter)
    : 'attention'
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<BoardFilter>(validInitial)
  const [channel, setChannel] = useState('all')
  const [campaignId, setCampaignId] = useState(
    campaigns.some((campaign) => campaign.id === initialCampaignId) ? initialCampaignId : 'all',
  )
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const searchRef = useRef<HTMLInputElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const [bulkState, bulkAction, bulkPending] = useActionState(async (previousState: ActionState, formData: FormData) => {
    const result = await approvePostsAction(previousState, formData)
    if (result.success) setSelectedIds(new Set())
    return result
  }, {})

  const filteredPosts = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('pt-BR')
    return posts.filter((post) => {
      const group = postColumn(post)
      const matchesStatus =
        status === 'all' ||
        (status === 'attention'
          ? post.status === 'pending_approval' || post.status === 'approved'
          : group === status)
      const matchesChannel = channel === 'all' || post.channel === channel
      const matchesCampaign = campaignId === 'all' || post.campaignId === campaignId
      const haystack = [post.hook, post.body, post.cta, post.channel].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR')
      return matchesStatus && matchesChannel && matchesCampaign && (!needle || haystack.includes(needle))
    })
  }, [campaignId, channel, posts, query, status])

  const filteredIdeas = useMemo(() => {
    if (status !== 'all' && status !== 'attention' && status !== 'ideas') return []
    const needle = query.trim().toLocaleLowerCase('pt-BR')
    return ideas.filter((idea) => {
      const matchesCampaign = campaignId === 'all' || idea.campaignId === campaignId
      const haystack = `${idea.title} ${idea.summary}`.toLocaleLowerCase('pt-BR')
      return idea.status === 'proposed' && matchesCampaign && (!needle || haystack.includes(needle))
    })
  }, [campaignId, ideas, query, status])

  const visibleSelectableIds = filteredPosts
    .filter((post) => post.status === 'pending_approval' && (post.riskReview as RiskReview | null)?.verdict !== 'block')
    .map((post) => post.id)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === '/' && !isEditableTarget(event.target)) {
        event.preventDefault()
        searchRef.current?.focus()
        return
      }
      if ((event.key === 'j' || event.key === 'k') && !isEditableTarget(event.target)) {
        const cards = Array.from(
          boardRef.current?.querySelectorAll<HTMLAnchorElement>('[data-post-card]') ?? [],
        )
        if (cards.length === 0) return
        event.preventDefault()
        const currentIndex = cards.indexOf(document.activeElement as HTMLAnchorElement)
        const delta = event.key === 'j' ? 1 : -1
        const nextIndex = currentIndex < 0 ? (delta > 0 ? 0 : cards.length - 1) : (currentIndex + delta + cards.length) % cards.length
        cards[nextIndex]?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function toggleSelected(postId: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(postId)) next.delete(postId)
      else next.add(postId)
      return next
    })
  }

  function selectVisible() {
    setSelectedIds(new Set(visibleSelectableIds))
  }

  const columns = COLUMNS.filter((column) => {
    if (status === 'attention') return column.key === 'ideas' || column.key === 'pending_approval' || column.key === 'approved'
    if (status !== 'all') return column.key === status
    if (column.key === 'ideas') return filteredIdeas.length > 0
    return filteredPosts.some((post) => postColumn(post) === column.key)
  })

  const resultCount = filteredPosts.length + filteredIdeas.length

  return (
    <section id="content-board" aria-labelledby="content-board-title" className="space-y-4 scroll-mt-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="content-board-title" className="text-lg font-medium">Fila de conteúdo</h2>
          <p className="text-ink-soft mt-1 text-sm">
            {resultCount} item{resultCount === 1 ? '' : 's'} · <kbd>/</kbd> busca · <kbd>j</kbd>/<kbd>k</kbd> navega
          </p>
        </div>
      </div>

      <div className="border-line grid gap-2 border-y py-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_170px_160px_190px]">
        <label className="relative min-w-0">
          <span className="sr-only">Buscar conteúdo</span>
          <MagnifyingGlass aria-hidden size={16} className="text-ink-faint pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar texto ou canal"
            aria-keyshortcuts="/"
            className="input input-with-icon"
          />
        </label>
        <label>
          <span className="sr-only">Filtrar por estado</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as BoardFilter)} className="input">
            {FILTER_LABELS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Filtrar por canal</span>
          <select value={channel} onChange={(event) => setChannel(event.target.value)} className="input">
            <option value="all">Todos os canais</option>
            {[...new Set(posts.map((post) => post.channel))].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Filtrar por campanha</span>
          <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)} className="input">
            <option value="all">Todas as campanhas</option>
            {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
          </select>
        </label>
      </div>

      {visibleSelectableIds.length > 0 && (
        <form action={bulkAction} className="border-line bg-panel flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
          <input type="hidden" name="productId" value={productId} />
          {[...selectedIds].map((postId) => <input key={postId} type="hidden" name="postId" value={postId} />)}
          <div className="min-w-0">
            <p className="text-sm font-medium">{selectedIds.size} selecionado{selectedIds.size === 1 ? '' : 's'}</p>
            <p aria-live="polite" className={`text-xs ${bulkState.error ? 'text-danger' : bulkState.success ? 'text-ok' : 'text-ink-faint'}`}>
              {bulkState.error ?? bulkState.success ?? 'Posts bloqueados pelo risk review não podem entrar no lote.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={selectVisible} className="btn btn-secondary">
              Selecionar visíveis
            </button>
            <button type="submit" disabled={selectedIds.size === 0 || bulkPending} className="btn btn-primary">
              {bulkPending && <Spinner size="xs" />}
              {bulkPending ? 'Aprovando…' : `Aprovar ${selectedIds.size || ''}`.trim()}
            </button>
          </div>
        </form>
      )}

      {resultCount === 0 ? (
        <div className="border-line text-ink-soft rounded-md border border-dashed p-8 text-center text-sm">
          Nenhum item corresponde aos filtros. Limpe a busca ou escolha outro estado.
        </div>
      ) : (
        <div ref={boardRef} className="grid gap-5 md:flex md:items-start md:gap-4 md:overflow-x-auto md:pb-2">
          {columns.map((column) => {
            const columnPosts = filteredPosts.filter((post) => postColumn(post) === column.key)
            const count = column.key === 'ideas' ? filteredIdeas.length : columnPosts.length
            return (
              <KanbanColumn key={column.key} label={column.label} description={column.description} count={count}>
                {column.key === 'ideas'
                  ? filteredIdeas.map((idea) => <IdeaCard key={idea.id} idea={idea} />)
                  : columnPosts.map((post) => {
                      const review = post.riskReview as RiskReview | null
                      const selectable = post.status === 'pending_approval' && review?.verdict !== 'block'
                      return (
                        <PostCard
                          key={post.id}
                          post={post}
                          productId={productId}
                          metrics={metrics[post.id]}
                          selected={selectedIds.has(post.id)}
                          selectable={selectable}
                          active={selectedPostId === post.id}
                          onToggle={() => toggleSelected(post.id)}
                        />
                      )
                    })}
              </KanbanColumn>
            )
          })}
        </div>
      )}
    </section>
  )
}

function KanbanColumn({ label, description, count, children }: { label: string; description: string; count: number; children: React.ReactNode }) {
  return (
    <section className="min-w-0 space-y-2 md:w-[270px] md:flex-none">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{label}</h3>
          <p className="text-ink-faint truncate text-xs">{description}</p>
        </div>
        <span className="text-ink-faint bg-line/40 rounded-sm px-1.5 py-0.5 font-mono text-xs tabular-nums">{count}</span>
      </div>
      <div className="grid gap-2">
        {count === 0 ? <p className="text-ink-faint border-line rounded-md border border-dashed p-3 text-xs">Nenhum item aqui.</p> : children}
      </div>
    </section>
  )
}

function IdeaCard({ idea }: { idea: ContentIdea }) {
  return (
    <article className="card min-w-0">
      <p className="text-accent text-xs">{ANGLE_LABELS[idea.angle]}</p>
      <p className="[overflow-wrap:anywhere] text-[13px] font-medium leading-snug">{idea.title}</p>
      <p className="card-body line-clamp-2">{idea.summary}</p>
      {idea.summary.startsWith('[near_duplicate') && <p className="text-warn text-xs">Possível duplicata</p>}
    </article>
  )
}

function PostCard({
  post,
  productId,
  metrics,
  selected,
  selectable,
  active,
  onToggle,
}: {
  post: SocialPost
  productId: string
  metrics?: { clicks: number; signups: number }
  selected: boolean
  selectable: boolean
  active: boolean
  onToggle: () => void
}) {
  const review = post.riskReview as RiskReview | null
  return (
    <article className={`card min-w-0 ${active ? 'border-accent' : ''}`}>
      <div className="flex min-h-7 items-center justify-between gap-2">
        <span className="text-ink-faint text-xs">{post.channel}</span>
        <div className="flex items-center gap-2">
          <RiskBadge verdict={review?.verdict} />
          {selectable && (
            <label className="inline-flex size-11 cursor-pointer items-center justify-center" title="Selecionar para aprovação em lote">
              <span className="sr-only">Selecionar post</span>
              <input type="checkbox" checked={selected} onChange={onToggle} className="size-4 accent-accent" />
            </label>
          )}
        </div>
      </div>
      <Link
        href={`/products/${productId}/content?postId=${post.id}`}
        data-post-card
        aria-current={active ? 'true' : undefined}
        className="hover:text-accent [overflow-wrap:anywhere] flex min-h-11 items-center text-[13px] font-medium leading-snug transition-colors"
      >
        {post.hook}
      </Link>
      {post.rejectionReason && <p className="text-danger line-clamp-2 text-xs">{post.rejectionReason}</p>}
      {post.status === 'published' && metrics && (
        <p className="text-ink-faint text-xs tabular-nums">{metrics.clicks} cliques · {metrics.signups} inscrições</p>
      )}
    </article>
  )
}

function RiskBadge({ verdict }: { verdict?: string }) {
  if (!verdict) return null
  const styles: Record<string, string> = { pass: 'text-ok', flag: 'text-warn', block: 'text-danger' }
  const labels: Record<string, string> = { pass: 'risco ok', flag: 'revisar risco', block: 'bloqueado' }
  return <span className={`text-xs ${styles[verdict] ?? 'text-ink-faint'}`}>{labels[verdict] ?? verdict}</span>
}
