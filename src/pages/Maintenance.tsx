import { Wrench } from 'lucide-react'

export default function Maintenance() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="mb-6 flex justify-center">
          <Wrench className="h-24 w-24 text-yellow-500 animate-pulse" />
        </div>
        <h1 className="text-4xl font-bold text-white mb-4">
          Site Under Maintenance
        </h1>
        <h2 className="text-3xl font-bold text-white mb-6" dir="rtl">
          الموقع قيد الصيانة
        </h2>
        <p className="text-slate-300 mb-4">
          We're currently performing scheduled maintenance to improve your experience.
        </p>
        <p className="text-slate-300 mb-8" dir="rtl">
          نقوم حاليًا بإجراء صيانة مجدولة لتحسين تجربتك.
        </p>
        <p className="text-slate-400 text-sm">
          Please check back soon. Thank you for your patience!
        </p>
      </div>
    </div>
  )
}
