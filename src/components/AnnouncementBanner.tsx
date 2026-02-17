import { useState, useEffect } from 'react'
import { getSiteAnnouncement } from '@/lib/supabase'
import { X } from 'lucide-react'

export default function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState<{ ar: string; en: string } | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    loadAnnouncement()
  }, [])

  async function loadAnnouncement() {
    const data = await getSiteAnnouncement()
    if (data && (data.ar || data.en)) {
      setAnnouncement(data)
    }
  }

  if (!announcement || dismissed) return null
  if (!announcement.ar && !announcement.en) return null

  return (
    <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 text-center">
            {announcement.ar && (
              <p className="text-sm md:text-base font-medium" dir="rtl">
                {announcement.ar}
              </p>
            )}
            {announcement.en && (
              <p className="text-sm md:text-base font-medium mt-1">
                {announcement.en}
              </p>
            )}
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="flex-shrink-0 p-1 hover:bg-white/20 rounded-full transition"
            aria-label="Dismiss announcement"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
