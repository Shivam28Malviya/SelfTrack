import { useEffect } from 'react'

// Generic centered popup. Click backdrop or press Escape to close.
export default function Modal({ title, onClose, children, maxWidth = 'max-w-lg' }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className={`w-full ${maxWidth} bg-slate-900 border border-white/15 rounded-2xl shadow-2xl animate-scale-in`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="font-bold text-white text-lg">{title}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white hover:bg-white/10 w-8 h-8 rounded-full text-xl leading-none flex items-center justify-center"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
