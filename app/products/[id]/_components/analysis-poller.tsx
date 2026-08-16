'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const POLL_INTERVAL_MS = 3_000

export function AnalysisPoller({ isRunning }: { isRunning: boolean }) {
  const router = useRouter()

  useEffect(() => {
    if (!isRunning) return
    const id = setInterval(() => router.refresh(), POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [isRunning, router])

  return null
}
