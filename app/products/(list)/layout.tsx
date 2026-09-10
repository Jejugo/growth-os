import { requireUser } from '@/server/guard'
import { Sidebar } from '../../_components/sidebar'
import { getSidebarData } from '../../_components/sidebar-data'
import { SignOutButton } from '../../_components/auth-buttons'

export default async function ProductsListLayout({ children }: { children: React.ReactNode }) {
  const [user, { products, automationActive }] = await Promise.all([requireUser(), getSidebarData()])

  return (
    <div className="flex min-h-screen">
      <Sidebar
        products={products}
        currentProduct={null}
        automationActive={automationActive}
        userEmail={user.email}
        signOutSlot={<SignOutButton />}
      />
      <main className="flex-1 overflow-x-hidden px-8 py-8">{children}</main>
    </div>
  )
}
