import { Spinner } from './spinner'

/** Fallback de `loading.tsx` — mostrado via Suspense enquanto o conteúdo da rota carrega. */
export function PageLoading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="text-ink-faint flex min-h-[40vh] flex-col items-center justify-center gap-3 text-sm">
      <Spinner size="lg" className="text-accent" />
      {label}
    </div>
  )
}
