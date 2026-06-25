'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

// Shows a scannable QR for a session's public check-in link. Scanning opens
// /play/[code] where the player types their name and joins — no app needed.
export function OpenPlayQR({ shareCode, size = 220 }: { shareCode: string; size?: number }) {
  const [url, setUrl] = useState(`/play/${shareCode}`)
  useEffect(() => { setUrl(`${window.location.origin}/play/${shareCode}`) }, [shareCode])

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="bg-white p-3 rounded-xl border shadow-sm">
        <QRCodeSVG value={url} size={size} level="M" />
      </div>
      <p className="text-xs text-gray-500 text-center break-all max-w-[260px]">{url}</p>
    </div>
  )
}
