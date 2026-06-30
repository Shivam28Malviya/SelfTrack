export default function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900/90 backdrop-blur-lg border border-white/20 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 animate-scale-in">
        <h2 className="text-lg font-bold text-white mb-2">{title}</h2>
        {message && <p className="text-slate-300 text-sm mb-5">{message}</p>}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="text-slate-300 hover:text-white hover:bg-white/10 font-semibold px-4 py-2 rounded-lg text-sm"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`text-white font-semibold px-4 py-2 rounded-lg text-sm shadow-md hover:shadow-lg active:scale-95 ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
