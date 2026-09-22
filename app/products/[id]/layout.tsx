import { notFound } from 'next/navigation'
import { requireUser } from '@/server/guard'
import { findProduct } from '@/modules/products'
import { Sidebar } from '../../_components/sidebar'
import { getSidebarData, getProductSectionAvailability } from '../../_components/sidebar-data'
import { SignOutButton } from '../../_components/auth-buttons'

export default async function ProductLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [user, product, { products, automationActive, manualPendingByProduct }] = await Promise.all([
    requireUser(),
    findProduct(id),
    getSidebarData(),
  ])
  if (!product) notFound()

  const sectionAvailability = await getProductSectionAvailability(product.id, product.stage)

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar
        products={products}
        currentProduct={{
          id: product.id,
          name: product.name,
          domain: product.domain,
          stage: product.stage,
        }}
        automationActive={automationActive}
        userEmail={user.email}
        signOutSlot={<SignOutButton />}
        sectionAvailability={sectionAvailability}
        manualPendingByProduct={manualPendingByProduct}
      />
      <main id="main-content" className="min-w-0 flex-1 overflow-x-hidden px-4 py-5 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  )
}
