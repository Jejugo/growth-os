import { requireUser } from '@/server/guard'
import { NewProductForm } from './form'

export default async function NewProductPage() {
  await requireUser()

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-xl font-semibold tracking-tight">Adicionar SaaS</h1>
      <p className="text-ink-soft mt-1 text-sm">
        Cole a URL. O GrowthOS lê o site e monta um Product Profile editável.
      </p>
      <div className="mt-6">
        <NewProductForm />
      </div>
    </div>
  )
}
