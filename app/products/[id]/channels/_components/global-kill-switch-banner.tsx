export function GlobalKillSwitchBanner() {
  return (
    <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-900/20">
      <p className="text-sm font-semibold text-red-700 dark:text-red-400">
        🛑 Kill switch global ativo
      </p>
      <p className="mt-0.5 text-xs text-red-600 dark:text-red-500">
        Nenhuma publicação será feita em nenhum canal até você desativar o kill switch no painel principal.
      </p>
    </div>
  )
}
