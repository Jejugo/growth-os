const STYLES: Record<string, { label: string; className: string }> = {
  never: { label: 'nunca analisado', className: 'tag-neutral' },
  running: { label: 'analisando', className: 'tag-accent' },
  ok: { label: 'analisado', className: 'text-ok border border-ok/35' },
  failed: { label: 'falhou', className: 'text-danger border border-danger/35' },
}

export function StatusBadge({ status }: { status: string }) {
  const style = STYLES[status] ?? STYLES.never!
  return (
    <span className={`tag items-center gap-1.5 font-mono ${style.className}`}>
      {status === 'running' && (
        <span className="bg-current size-1.5 animate-pulse rounded-full" aria-hidden />
      )}
      {style.label}
    </span>
  )
}
