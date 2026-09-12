'use client'

import { useState } from 'react'

export function CopyPromptBlock({ prompt, rows = 16 }: { prompt: string; rows?: number }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-2">
      <textarea
        readOnly
        value={prompt}
        rows={rows}
        onFocus={(e) => e.currentTarget.select()}
        className="input resize-y font-mono text-xs leading-relaxed"
      />
      <button onClick={handleCopy} className="btn btn-secondary">
        {copied ? 'Copiado!' : 'Copiar prompt'}
      </button>
    </div>
  )
}
