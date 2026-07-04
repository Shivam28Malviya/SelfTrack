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
      <div className="bg-white border border-neutral-200 rounded-[24px] shadow-2xl w-full max-w-sm mx-4 p-6 animate-scale-in">
        <h2 className="text-lg font-bold text-neutral-900 mb-2">{title}</h2>
        {message && <p className="text-neutral-500 text-sm mb-5">{message}</p>}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 font-semibold px-4 py-2 rounded-full text-sm"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`text-white font-semibold px-5 py-2 rounded-full text-sm active:scale-95 ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-neutral-900 hover:bg-neutral-800'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
