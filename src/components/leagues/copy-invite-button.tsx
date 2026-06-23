'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Copy, Check } from 'lucide-react'

export function CopyInviteButton({ inviteCode, onLight }: { inviteCode: string; onLight?: boolean }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(inviteCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className={`gap-2 ${onLight ? 'bg-white/15 border-white/40 text-white hover:bg-white/25 hover:text-white backdrop-blur-sm' : ''}`}
    >
      {copied ? <Check className={`w-3.5 h-3.5 ${onLight ? 'text-white' : 'text-green-600'}`} /> : <Copy className="w-3.5 h-3.5" />}
      <span className="font-mono tracking-widest">{inviteCode}</span>
    </Button>
  )
}
