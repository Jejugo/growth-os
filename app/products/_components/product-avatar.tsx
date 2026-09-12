/** Puramente visual — logo do produto ou, na falta dele, a inicial do nome. Sem interatividade. */
export function ProductAvatar({
  name,
  logoUrl,
  size = 48,
}: {
  name: string
  logoUrl: string | null
  size?: number
}) {
  return (
    <div
      className="border-line bg-surface flex shrink-0 items-center justify-center overflow-hidden rounded-md border"
      style={{ width: size, height: size }}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URI, sem otimização de imagem aplicável
        <img src={logoUrl} alt={`Logo de ${name}`} className="h-full w-full object-contain" />
      ) : (
        <span className="text-ink-faint font-semibold" style={{ fontSize: size * 0.4 }}>
          {name.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  )
}
