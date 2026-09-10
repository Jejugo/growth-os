'use client'

import { useState } from 'react'

export function CopyPromptBlock({ prompt }: { prompt: string }) {
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
        rows={16}
        onFocus={(e) => e.currentTarget.select()}
        className="input resize-y font-mono text-xs leading-relaxed"
      />
      <button onClick={handleCopy} className="btn btn-secondary">
        {copied ? 'Copiado!' : 'Copiar prompt'}
      </button>
    </div>
  )
}
