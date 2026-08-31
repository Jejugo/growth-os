import { requireUser } from '@/server/guard'
import { NewProductForm } from './form'

export default async function NewProductPage() {
  await requireUser()

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-xl font-semibold tracking-tight">Adicionar produto</h1>
      <p className="text-ink-soft mt-1 text-sm">
        Já tem site: cole a URL e o GrowthOS lê e monta um Product Profile editável. Ainda é só
        ideia: escreva o brief e teste a demanda antes de construir.
      </p>
      <div className="mt-6">
        <NewProductForm />
      </div>
    </div>
  )
}
