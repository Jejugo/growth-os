import { requireUser } from '@/server/guard'
import { NewProductForm } from './form'

export default async function NewProductPage() {
  await requireUser()

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="min-w-0 max-w-xl">
        <h1 className="text-xl font-semibold tracking-tight">Cadastrar produto</h1>
        <p className="text-ink-soft mt-1 text-sm">
          Já tem site: cole a URL e o GrowthOS lê e monta um Product Profile editável. Ainda é só
          ideia: escreva o brief e teste a demanda antes de construir.
        </p>
        <div className="mt-6">
          <NewProductForm />
        </div>
      </div>

      <aside className="border-line flex flex-col gap-4 border-l pl-6">
        <div>
          <h2 className="text-accent mb-2.5 text-sm font-medium">O que acontece depois</h2>
          <ol className="grid gap-2.5 text-[12.5px] leading-relaxed">
            <Step n="01">Brief vira hipótese e três ângulos de teste.</Step>
            <Step n="02">A IA gera a landing de waitlist e o conteúdo de validação.</Step>
            <Step n="03">Você define janela e limiares; o ciclo traz o tráfego.</Step>
            <Step n="04">No fim da janela sai um veredicto: construir, pivotar ou matar.</Step>
          </ol>
        </div>
        <hr className="hr" />
        <div>
          <h2 className="text-accent mb-2.5 text-sm font-medium">Custo estimado</h2>
          <div className="text-ink-faint grid gap-1.5 font-mono text-xs">
            <Cost label="brief → ângulos" value="US$ 0,04" />
            <Cost label="landing page" value="US$ 0,11" />
            <Cost label="conteúdo (12 posts)" value="US$ 0,38" />
            <div className="border-line text-ink flex justify-between border-t pt-1.5">
              <span>total</span>
              <span>US$ 0,53</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}

function Step({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="text-ink-faint font-mono text-[11px] leading-relaxed">{n}</span>
      <span>{children}</span>
    </li>
  )
}

function Cost({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}
