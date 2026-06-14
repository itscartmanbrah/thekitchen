'use client'

import { useEffect, useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download, Share, Smartphone } from 'lucide-react'

export function InstallAppButton() {
  const [open, setOpen] = useState(false)
  const [deferred, setDeferred] = useState<any>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    setInstalled(!!standalone)

    const onPrompt = (e: any) => { e.preventDefault(); setDeferred(e) }
    const onInstalled = () => { setInstalled(true); setOpen(false) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function installNow() {
    if (!deferred) return
    deferred.prompt()
    const { outcome } = await deferred.userChoice
    if (outcome === 'accepted') setInstalled(true)
    setDeferred(null)
  }

  // Already installed → no need for the button
  if (installed) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Install app"
        title="Install app"
        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
      >
        <Download className="w-5 h-5 text-gray-600" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-green-600" />
              Install The Kitchen
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-sm text-gray-600">
            <p>Add The Kitchen to your home screen for a full-screen, app-like experience — no app store needed.</p>

            {deferred && (
              <Button onClick={installNow} className="w-full">
                <Download className="w-4 h-4 mr-1" />
                Install now
              </Button>
            )}

            {/* iPhone / iPad */}
            <div className="rounded-lg border bg-gray-50 px-3 py-2.5">
              <p className="font-semibold text-gray-800 mb-1.5">📱 iPhone / iPad (Safari)</p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>
                  Tap the <strong>Share</strong> button
                  <Share className="inline w-3.5 h-3.5 mx-1 -mt-0.5" />
                  at the bottom of Safari.
                </li>
                <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                <li>Tap <strong>Add</strong> in the top-right corner.</li>
              </ol>
            </div>

            {/* Android */}
            <div className="rounded-lg border bg-gray-50 px-3 py-2.5">
              <p className="font-semibold text-gray-800 mb-1.5">🤖 Android (Chrome)</p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Tap the <strong>⋮</strong> menu in the top-right.</li>
                <li>Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>).</li>
                <li>Confirm with <strong>Install</strong>.</li>
              </ol>
            </div>

            <p className="text-xs text-gray-400">
              Once added, open The Kitchen from your home screen just like any other app.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
