import { useState, useEffect, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiCall } from '../lib/api'
import { getSupabase, FILES_BUCKET } from '../lib/supabaseClient'
import Sidebar from '../components/Sidebar'
import ConfirmDialog from '../components/ConfirmDialog'
import { useToast } from '../components/Toast'

// Supabase's free-tier default per-file cap. Raise this if the project is
// on a paid plan with a higher configured limit.
const MAX_FILE_BYTES = 50 * 1024 * 1024

function formatBytes(n) {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatElapsed(seconds) {
  if (seconds < 60) return `${Math.floor(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}m ${s}s`
}

function fileIcon(name) {
  const ext = (name.split('.').pop() || '').toLowerCase()
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '📦'
  if (ext === 'pdf') return '📕'
  if (['ppt', 'pptx'].includes(ext)) return '📊'
  if (['doc', 'docx', 'txt', 'md'].includes(ext)) return '📝'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📈'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return '🖼️'
  if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return '🎬'
  if (['mp3', 'wav', 'ogg'].includes(ext)) return '🎵'
  return '📁'
}

export default function Files() {
  const { isAdmin, initializing } = useAuth()
  const { toast } = useToast()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [batch, setBatch] = useState(null) // { index, total, name }
  const [elapsedSec, setElapsedSec] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null) // { type: 'file'|'clipboard', id, label }
  const [clipboards, setClipboards] = useState([])
  const [clipboardsLoading, setClipboardsLoading] = useState(true)
  const [drafts, setDrafts] = useState({}) // id -> { name, text }
  const [savingId, setSavingId] = useState(null)
  const [creatingClipboard, setCreatingClipboard] = useState(false)
  const inputRef = useRef(null)
  const elapsedTimerRef = useRef(null)

  useEffect(() => {
    if (!isAdmin) return
    apiCall('GET', '/files').then(data => {
      if (data.success) setFiles(data.files)
      else toast(data.error, 'error')
      setLoading(false)
    })
    apiCall('GET', '/clipboards').then(data => {
      if (data.success) {
        setClipboards(data.clipboards)
        setDrafts(Object.fromEntries(data.clipboards.map(c => [c.id, { name: c.name, text: c.text }])))
      } else toast(data.error, 'error')
      setClipboardsLoading(false)
    })
  }, [isAdmin])

  const draftFor = (c) => drafts[c.id] || { name: c.name, text: c.text }
  const isDirty = (c) => {
    const d = draftFor(c)
    return d.name !== c.name || d.text !== c.text
  }
  const setDraft = (id, patch) => setDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  const handleCreateClipboard = async () => {
    setCreatingClipboard(true)
    const data = await apiCall('POST', '/clipboards', { name: 'Untitled', text: '' })
    setCreatingClipboard(false)
    if (data.success) {
      setClipboards(data.clipboards)
      setDrafts(prev => ({
        ...Object.fromEntries(data.clipboards.map(c => [c.id, prev[c.id] || { name: c.name, text: c.text }])),
      }))
      toast('Clipboard created.', 'success')
    } else {
      toast(data.error || 'Could not create clipboard.', 'error')
    }
  }

  const handleSaveClipboard = async (c) => {
    const d = draftFor(c)
    setSavingId(c.id)
    const data = await apiCall('PUT', `/clipboards/${c.id}`, { name: d.name.trim() || 'Untitled', text: d.text })
    setSavingId(null)
    if (data.success) {
      setClipboards(data.clipboards)
      toast('Clipboard saved.', 'success')
    } else {
      toast(data.error || 'Could not save clipboard.', 'error')
    }
  }

  const handleDeleteClipboard = async () => {
    const target = confirmDelete
    setConfirmDelete(null)
    const data = await apiCall('DELETE', `/clipboards/${target.id}`)
    if (data.success) {
      setClipboards(data.clipboards)
      setDrafts(prev => {
        const next = { ...prev }
        delete next[target.id]
        return next
      })
      toast(`"${target.label}" deleted.`, 'success')
    } else {
      toast(data.error, 'error')
    }
  }

  if (!initializing && !isAdmin) return <Navigate to="/" replace />

  const uploadOne = async (file) => {
    setElapsedSec(0)
    elapsedTimerRef.current = setInterval(() => setElapsedSec(s => s + 1), 1000)
    try {
      // UUID-scoped folder keeps the trailing path segment — the filename
      // used for both storage and download — exactly the original name,
      // while still guaranteeing uniqueness across uploads.
      const path = `${crypto.randomUUID()}/${file.name}`

      // Admin-gated signed upload URL, minted server-side; the file bytes
      // then go straight from this browser to Supabase Storage using it —
      // never through our serverless function, so no 4.5MB body limit.
      const urlRes = await apiCall('POST', '/files/upload-url', { path })
      if (!urlRes.success) throw new Error(urlRes.error || 'Could not start upload.')

      const supabase = getSupabase()
      const { error: uploadError } = await supabase.storage
        .from(FILES_BUCKET)
        .uploadToSignedUrl(urlRes.path, urlRes.token, file, { contentType: file.type })
      if (uploadError) throw new Error(uploadError.message || 'Upload failed.')

      const { data: pub } = supabase.storage.from(FILES_BUCKET).getPublicUrl(urlRes.path)
      const data = await apiCall('POST', '/files', {
        name: file.name, url: pub.publicUrl, size: file.size, contentType: file.type,
      })
      if (!data.success) throw new Error(data.error || 'Upload failed.')
      setFiles(data.files)
    } finally {
      clearInterval(elapsedTimerRef.current)
    }
  }

  const handleFiles = async (fileList) => {
    const incoming = Array.from(fileList || [])
    if (incoming.length === 0) return

    const oversized = incoming.filter(f => f.size > MAX_FILE_BYTES)
    const valid = incoming.filter(f => f.size <= MAX_FILE_BYTES)
    if (oversized.length > 0) {
      toast(
        oversized.length === 1
          ? `"${oversized[0].name}" is over ${formatBytes(MAX_FILE_BYTES)} — skipped.`
          : `${oversized.length} files are over ${formatBytes(MAX_FILE_BYTES)} — skipped.`,
        'error',
      )
    }
    if (valid.length === 0) {
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    setUploading(true)
    const failed = []
    let succeeded = 0
    // Uploaded one at a time — simplest way to keep the "File N of M" status
    // meaningful and avoid stacking several transfers on one connection.
    for (let i = 0; i < valid.length; i++) {
      const file = valid[i]
      setBatch({ index: i + 1, total: valid.length, name: file.name })
      try {
        await uploadOne(file)
        succeeded++
      } catch (err) {
        console.error('[Files upload] failed:', file.name, err)
        const msg = err?.message || String(err)
        failed.push(`${file.name} (${msg})`)
      }
    }

    setUploading(false)
    setBatch(null)
    if (inputRef.current) inputRef.current.value = ''

    if (failed.length === 0) {
      toast(succeeded === 1 ? `"${valid[0].name}" uploaded.` : `${succeeded} files uploaded.`, 'success')
    } else if (succeeded > 0) {
      toast(`${succeeded} uploaded. Failed: ${failed.join('; ')}`, 'error', 12000)
    } else {
      toast(`Upload failed: ${failed.join('; ')}`, 'error', 12000)
    }
  }

  const handleDeleteFile = async () => {
    const target = confirmDelete
    setConfirmDelete(null)
    const data = await apiCall('DELETE', `/files/${target.id}`)
    if (data.success) {
      setFiles(data.files)
      toast(`"${target.label}" deleted.`, 'success')
    } else {
      toast(data.error, 'error')
    }
  }

  const handleConfirmDelete = () => {
    if (confirmDelete?.type === 'clipboard') return handleDeleteClipboard()
    return handleDeleteFile()
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-20 pb-8 lg:pt-10 animate-slide-up">
          <span className="eyebrow">/Admin</span>
          <h1 className="display text-5xl text-neutral-900 mt-1 mb-1">FILES</h1>
          <p className="text-neutral-500 mb-6">Upload and share files — zip, pdf, ppt, and more. Max {formatBytes(MAX_FILE_BYTES)} each.</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Left: upload + file list */}
            <div>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
                onClick={() => !uploading && inputRef.current?.click()}
                className={`card p-8 mb-6 text-center cursor-pointer transition-colors ${
                  dragOver ? 'border-[#a97e5d] bg-[#f3ece3]' : 'hover:border-neutral-400'
                } ${uploading ? 'opacity-60 cursor-wait' : ''}`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={e => handleFiles(e.target.files)}
                  disabled={uploading}
                />
                {uploading ? (
                  <div className="flex flex-col items-center gap-3 cursor-default" onClick={e => e.stopPropagation()}>
                    <div className="w-full max-w-xs">
                      {batch && batch.total > 1 && (
                        <p className="text-xs font-semibold text-neutral-500 mb-1.5 truncate">
                          File {batch.index} of {batch.total} — {batch.name}
                        </p>
                      )}
                      <div className="flex items-baseline justify-between mb-1.5">
                        <span className="text-sm font-bold text-neutral-900">Uploading…</span>
                        <span className="text-xs font-medium text-neutral-500">{formatElapsed(elapsedSec)} elapsed</span>
                      </div>
                      {/* Indeterminate — Supabase's client doesn't expose byte-level progress */}
                      <div className="h-2 w-full bg-neutral-200 rounded-full overflow-hidden relative">
                        <div className="absolute inset-y-0 left-0 w-1/3 bg-[#a97e5d] rounded-full animate-[indeterminateBar_1.2s_ease-in-out_infinite]" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-4xl mb-2">📤</div>
                    <p className="font-semibold text-neutral-900">Drop files here or click to browse</p>
                    <p className="text-xs text-neutral-400 mt-1">zip · pdf · ppt · doc · xls · images · up to {formatBytes(MAX_FILE_BYTES)} each · multiple files OK</p>
                  </>
                )}
              </div>

              {/* File list */}
              {loading ? (
                <p className="text-neutral-400 text-sm text-center py-8">Loading files…</p>
              ) : files.length === 0 ? (
                <div className="text-center py-14 text-neutral-400 animate-fade-in">
                  <div className="text-5xl mb-3">🗂️</div>
                  <p className="font-medium">No files yet. Upload the first one above.</p>
                </div>
              ) : (
                <div className="card overflow-hidden">
                  {files.map((f, i) => (
                    <div
                      key={f.id}
                      style={{ animationDelay: `${i * 40}ms` }}
                      className="flex items-center gap-3 px-4 sm:px-5 py-3.5 border-b last:border-b-0 border-neutral-100 hover:bg-neutral-50 animate-fade-in"
                    >
                      <span className="text-2xl shrink-0">{fileIcon(f.name)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-neutral-900 text-sm truncate">{f.name}</p>
                        <p className="text-neutral-400 text-xs">
                          {formatBytes(f.size)} · {f.uploadedBy} · {new Date(f.ts).toLocaleDateString()}
                        </p>
                      </div>
                      <a
                        href={`${f.url}?download=${encodeURIComponent(f.name)}`}
                        className="shrink-0 text-xs bg-neutral-900 hover:bg-neutral-800 text-white font-semibold px-3 py-1.5 rounded-full active:scale-95"
                      >
                        ⬇ Download
                      </a>
                      <button
                        onClick={() => setConfirmDelete({ type: 'file', id: f.id, label: f.name })}
                        className="shrink-0 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-600 border border-red-300/30 font-semibold px-2.5 py-1.5 rounded-full active:scale-95"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: clipboards — multiple named text snippets, each pasted/saved/edited/deleted independently */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-bold text-neutral-900">Clipboards</h2>
                  <p className="text-xs text-neutral-400">Paste and save large text — no length limit.</p>
                </div>
                <button
                  onClick={handleCreateClipboard}
                  disabled={creatingClipboard}
                  className="shrink-0 text-xs bg-neutral-900 hover:bg-neutral-800 text-white font-semibold px-3 py-1.5 rounded-full active:scale-95 disabled:opacity-50"
                >
                  {creatingClipboard ? 'Creating…' : '+ New'}
                </button>
              </div>

              {clipboardsLoading ? (
                <p className="text-neutral-400 text-sm text-center py-8">Loading clipboards…</p>
              ) : clipboards.length === 0 ? (
                <div className="text-center py-14 text-neutral-400 animate-fade-in">
                  <div className="text-5xl mb-3">📋</div>
                  <p className="font-medium">No clipboards yet. Create one above.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {clipboards.map((c, i) => {
                    const d = draftFor(c)
                    const dirty = isDirty(c)
                    const words = d.text.trim() ? d.text.trim().split(/\s+/).length : 0
                    return (
                      <div key={c.id} style={{ animationDelay: `${i * 40}ms` }} className="card p-4 animate-fade-in">
                        <div className="flex items-center gap-2 mb-2">
                          <input
                            value={d.name}
                            onChange={e => setDraft(c.id, { name: e.target.value })}
                            placeholder="Untitled"
                            className="flex-1 min-w-0 font-semibold text-neutral-900 text-sm bg-transparent border-b border-transparent hover:border-neutral-200 focus:border-[#a97e5d] focus:outline-none px-0.5 py-1"
                          />
                          <span className="text-xs text-neutral-400 shrink-0">
                            {words.toLocaleString()} words · {formatBytes(new Blob([d.text]).size)}
                          </span>
                        </div>
                        <textarea
                          value={d.text}
                          onChange={e => setDraft(c.id, { text: e.target.value })}
                          placeholder="Paste or type text here…"
                          className="w-full h-48 overflow-y-auto resize-y rounded-xl border border-neutral-200 p-3 text-sm font-mono text-neutral-800 focus:outline-none focus:border-[#a97e5d]"
                        />
                        <div className="flex items-center justify-between mt-3">
                          <span className="text-xs text-neutral-400">
                            {dirty ? 'Unsaved changes' : `Saved · ${new Date(c.updatedTs).toLocaleString()}`}
                          </span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setConfirmDelete({ type: 'clipboard', id: c.id, label: c.name })}
                              className="text-xs bg-red-500/20 hover:bg-red-500/30 text-red-600 border border-red-300/30 font-semibold px-3 py-1.5 rounded-full active:scale-95"
                            >
                              Delete
                            </button>
                            <button
                              onClick={() => handleSaveClipboard(c)}
                              disabled={savingId === c.id || !dirty}
                              className="text-xs bg-neutral-900 hover:bg-neutral-800 text-white font-semibold px-3 py-1.5 rounded-full active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {savingId === c.id ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <ConfirmDialog
        open={!!confirmDelete}
        title={`Delete "${confirmDelete?.label}"?`}
        message={
          confirmDelete?.type === 'clipboard'
            ? 'This clipboard and its text will be permanently deleted. This cannot be undone.'
            : 'The file will be permanently removed from storage. This cannot be undone.'
        }
        confirmLabel={confirmDelete?.type === 'clipboard' ? 'Delete clipboard' : 'Delete file'}
        danger
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
