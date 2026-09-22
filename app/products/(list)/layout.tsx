import { requireUser } from '@/server/guard'
import { Sidebar } from '../../_components/sidebar'
import { getSidebarData } from '../../_components/sidebar-data'
import { SignOutButton } from '../../_components/auth-buttons'

export default async function ProductsListLayout({ children }: { children: React.ReactNode }) {
  const [user, { products, automationActive, manualPendingByProduct }] = await Promise.all([requireUser(), getSidebarData()])

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar
        products={products}
        currentProduct={null}
        automationActive={automationActive}
        userEmail={user.email}
        signOutSlot={<SignOutButton />}
        manualPendingByProduct={manualPendingByProduct}
      />
      <main id="main-content" className="min-w-0 flex-1 overflow-x-hidden px-4 py-5 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  )
}
