import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Mail, Phone, ArrowLeft } from 'lucide-react'

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold">TK</span>
          </div>
          <span className="font-bold text-2xl text-gray-900">The Kitchen</span>
        </div>

        <Card>
          <CardContent className="pt-6 pb-6 space-y-6">

            <div className="text-center">
              <h1 className="text-xl font-bold text-gray-900 mb-1">Get in touch</h1>
              <p className="text-sm text-gray-500">
                Interested in beta testing or have questions about The Kitchen? Reach out directly.
              </p>
            </div>

            {/* Contact card */}
            <div className="bg-gray-50 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-white font-bold text-sm">CC</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Clyde Villaruz</p>
                  <p className="text-xs text-gray-500">Developer & Founder, The Kitchen</p>
                </div>
              </div>

              <div className="space-y-3 pt-1">
                <a
                  href="mailto:dowadowadidadowadi@gmail.com"
                  className="flex items-center gap-3 p-3 bg-white rounded-lg border hover:border-green-400 hover:bg-green-50 transition-colors group"
                >
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-400 mb-0.5">Email</p>
                    <p className="text-sm font-medium text-gray-800 truncate group-hover:text-green-700">
                      dowadowadidadowadi@gmail.com
                    </p>
                  </div>
                </a>

                <a
                  href="tel:+639215143152"
                  className="flex items-center gap-3 p-3 bg-white rounded-lg border hover:border-green-400 hover:bg-green-50 transition-colors group"
                >
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                    <Phone className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Phone / WhatsApp</p>
                    <p className="text-sm font-medium text-gray-800 group-hover:text-green-700">
                      0921 514 3152
                    </p>
                  </div>
                </a>
              </div>
            </div>

            <p className="text-xs text-center text-gray-400">
              The Kitchen is currently in private beta. Contact us to request access.
            </p>

          </CardContent>
        </Card>

        <div className="text-center mt-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-600 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to home
          </Link>
        </div>

      </div>
    </div>
  )
}
