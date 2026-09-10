export function GlobalKillSwitchBanner() {
  return (
    <div className="border-danger/30 bg-danger-soft rounded-md border px-4 py-3">
      <p className="text-danger text-sm font-medium">Kill switch global ativo</p>
      <p className="text-danger mt-0.5 text-xs opacity-80">
        Nenhuma publicação será feita em nenhum canal até você desativar o kill switch no painel
        principal.
      </p>
    </div>
  )
}
