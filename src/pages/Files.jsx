import { useState, useEffect, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import { upload } from '@vercel/blob/client'
import { useAuth } from '../context/AuthContext'
import { apiCall, getToken } from '../lib/api'
import Sidebar from '../components/Sidebar'
import ConfirmDialog from '../components/ConfirmDialog'
import { useToast } from '../components/Toast'

const MAX_FILE_BYTES = 100 * 1024 * 1024 // matches server token limit

function formatBytes(n) {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
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
  const [dragOver, setDragOver] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!isAdmin) return
    apiCall('GET', '/files').then(data => {
      if (data.success) setFiles(data.files)
      else toast(data.error, 'error')
      setLoading(false)
    })
  }, [isAdmin])

  if (!initializing && !isAdmin) return <Navigate to="/" replace />

  const handleFiles = async (fileList) => {
    const file = fileList?.[0]
    if (!file) return
    if (file.size > MAX_FILE_BYTES) return toast('File too large. Max 100 MB.', 'error')

    setUploading(true)
    try {
      // Browser -> Blob direct upload; session token rides along as the
      // clientPayload for the server-side admin check.
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/files/upload',
        clientPayload: getToken(),
      })
      const data = await apiCall('POST', '/files', {
        name: file.name, url: blob.url, size: file.size, contentType: file.type,
      })
      if (data.success) {
        setFiles(data.files)
        toast(`"${file.name}" uploaded.`, 'success')
      } else {
        toast(data.error, 'error')
      }
    } catch (err) {
      toast(err?.message?.includes('Admin') ? 'Admin access required.' : 'Upload failed. Is the Blob store connected?', 'error', 5000)
    }
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleDelete = async () => {
    const f = confirmDelete
    setConfirmDelete(null)
    const data = await apiCall('DELETE', `/files/${f.id}`)
    if (data.success) {
      setFiles(data.files)
      toast(`"${f.name}" deleted.`, 'success')
    } else {
      toast(data.error, 'error')
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-20 pb-8 lg:pt-10 animate-slide-up">
          <span className="eyebrow">/Admin</span>
          <h1 className="display text-5xl text-neutral-900 mt-1 mb-1">FILES</h1>
          <p className="text-neutral-500 mb-6">Upload and share files — zip, pdf, ppt, and more. Max 100 MB each.</p>

          {/* Upload area */}
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
              className="hidden"
              onChange={e => handleFiles(e.target.files)}
              disabled={uploading}
            />
            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <span className="w-8 h-8 border-2 border-neutral-300 border-t-neutral-900 rounded-full animate-spin" />
                <p className="text-sm font-medium text-neutral-600">Uploading…</p>
              </div>
            ) : (
              <>
                <div className="text-4xl mb-2">📤</div>
                <p className="font-semibold text-neutral-900">Drop a file here or click to browse</p>
                <p className="text-xs text-neutral-400 mt-1">zip · pdf · ppt · doc · xls · images · up to 100 MB</p>
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
                    href={`${f.url}?download=1`}
                    download={f.name}
                    className="shrink-0 text-xs bg-neutral-900 hover:bg-neutral-800 text-white font-semibold px-3 py-1.5 rounded-full active:scale-95"
                  >
                    ⬇ Download
                  </a>
                  <button
                    onClick={() => setConfirmDelete(f)}
                    className="shrink-0 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-600 border border-red-300/30 font-semibold px-2.5 py-1.5 rounded-full active:scale-95"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <ConfirmDialog
        open={!!confirmDelete}
        title={`Delete ${confirmDelete?.name}?`}
        message="The file will be permanently removed from storage. This cannot be undone."
        confirmLabel="Delete file"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
