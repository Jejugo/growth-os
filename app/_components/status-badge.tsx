const STYLES: Record<string, { label: string; className: string }> = {
  never: { label: 'nunca analisado', className: 'text-ink-faint border-line' },
  running: { label: 'analisando', className: 'text-accent border-accent/40 bg-accent-soft' },
  ok: { label: 'analisado', className: 'text-ok border-ok/30' },
  failed: { label: 'falhou', className: 'text-danger border-danger/30' },
}

export function StatusBadge({ status }: { status: string }) {
  const style = STYLES[status] ?? STYLES.never!
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[11px] ${style.className}`}
    >
      {status === 'running' && (
        <span className="bg-accent size-1.5 animate-pulse rounded-full" aria-hidden />
      )}
      {style.label}
    </span>
  )
}
