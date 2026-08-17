import Link from 'next/link'

interface NavItem {
  href: string
  label: string
}

export function ProductNav({
  productId,
  active,
}: {
  productId: string
  active: 'profile' | 'audiences' | 'campaigns' | 'content' | 'channels' | 'publications'
}) {
  const items: NavItem[] = [
    { href: `/products/${productId}`, label: 'Perfil' },
    { href: `/products/${productId}/audiences`, label: 'Audiências' },
    { href: `/products/${productId}/campaigns`, label: 'Campanhas' },
    { href: `/products/${productId}/content`, label: 'Conteúdo' },
    { href: `/products/${productId}/channels`, label: 'Canais' },
    { href: `/products/${productId}/publications`, label: 'Publicações' },
  ]
  const activeKeys: Record<string, string> = {
    profile: `/products/${productId}`,
    audiences: `/products/${productId}/audiences`,
    campaigns: `/products/${productId}/campaigns`,
    content: `/products/${productId}/content`,
    channels: `/products/${productId}/channels`,
    publications: `/products/${productId}/publications`,
  }
  const activeHref = activeKeys[active]

  return (
    <nav className="border-line flex gap-1 border-b pb-0">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={[
            'rounded-t-md px-4 py-2 text-sm font-medium transition-colors',
            item.href === activeHref
              ? 'bg-surface border-line border border-b-transparent text-ink'
              : 'text-ink-soft hover:text-ink',
          ].join(' ')}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
