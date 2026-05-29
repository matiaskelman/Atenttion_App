import { useEffect, useState } from 'react'
import { useStore } from '../../store'
import { FileText, Link, Plus, Trash2, Loader2, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Package } from 'lucide-react'

const extIcon = {
  pdf: '📄', docx: '📝', pptx: '📊', xlsx: '📈',
  txt: '📃', md: '📋', html: '🌐', csv: '🗂', url: '🔗'
}

function DocCard({ doc, onRemove }) {
  const [expanded, setExpanded] = useState(false)
  const preview = doc.content.slice(0, 300)

  return (
    <div className="card">
      <div className="flex items-start gap-3">
        <span className="text-xl shrink-0 mt-0.5">{extIcon[doc.ext] || '📄'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-200 truncate">{doc.name}</p>
          <p className="text-xs text-neutral-600 mt-0.5">
            {new Date(doc.addedAt).toLocaleString()} · {Math.round(doc.content.length / 1000)}k chars
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="btn-icon text-neutral-500 hover:text-neutral-300"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            onClick={() => onRemove(doc.id)}
            className="btn-icon text-neutral-600 hover:text-red-400"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-surface-3">
          <pre className="text-xs text-neutral-400 whitespace-pre-wrap font-mono leading-relaxed overflow-y-auto max-h-64">
            {doc.content.length > 2000 ? doc.content.slice(0, 2000) + '\n\n[…truncated]' : doc.content}
          </pre>
        </div>
      )}
    </div>
  )
}

export default function DocumentsPage() {
  const { documents, addDocument, removeDocument } = useStore()
  const [deps, setDeps] = useState(null)
  const [loading, setLoading] = useState(null) // null | 'file' | 'url' | 'install'
  const [url, setUrl] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    window.api?.docs.checkDeps().then(setDeps)
  }, [])

  const addFiles = async () => {
    setError(null)
    const paths = await window.api?.docs.pickFile()
    if (!paths?.length) return
    setLoading('file')
    try {
      for (const path of paths) {
        const result = await window.api?.docs.convertFile(path)
        if (result.success) addDocument(result)
        else setError(result.error)
      }
    } finally {
      setLoading(null)
    }
  }

  const addUrl = async () => {
    if (!url.trim()) return
    setError(null)
    setLoading('url')
    try {
      const result = await window.api?.docs.convertUrl(url.trim())
      if (result.success) {
        addDocument(result)
        setUrl('')
      } else {
        setError(result.error)
      }
    } finally {
      setLoading(null)
    }
  }

  const installMarkitdown = async () => {
    setLoading('install')
    const result = await window.api?.docs.installMarkitdown()
    if (result.success) {
      const updated = await window.api?.docs.checkDeps()
      setDeps(updated)
    } else {
      setError(result.error)
    }
    setLoading(null)
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-100">Documents</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Feed the app with PDFs, docs, and links to use as context
        </p>
      </div>

      {/* Dependency status */}
      {deps && (
        <div className="card mb-4">
          <h3 className="text-sm font-semibold text-neutral-300 mb-3 flex items-center gap-2">
            <Package size={14} className="text-violet-400" /> File Conversion Engine
          </h3>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-500">Python</span>
              {deps.python ? (
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <CheckCircle size={11} /> {deps.python}
                </span>
              ) : (
                <span className="text-xs text-red-400">Not found</span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-neutral-500">markitdown</span>
                <span className="text-xs text-neutral-700 ml-2">(PDFs, Word, Excel, PowerPoint)</span>
              </div>
              {deps.markitdown ? (
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <CheckCircle size={11} /> Installed
                </span>
              ) : deps.python ? (
                <button
                  onClick={installMarkitdown}
                  disabled={loading === 'install'}
                  className="btn btn-primary py-1 px-2 text-xs"
                >
                  {loading === 'install' ? (
                    <><Loader2 size={10} className="animate-spin" /> Installing…</>
                  ) : (
                    'pip install'
                  )}
                </button>
              ) : (
                <span className="text-xs text-neutral-600">Needs Python</span>
              )}
            </div>
            {!deps.markitdown && (
              <p className="text-xs text-neutral-600 mt-1">
                Without markitdown, only .txt, .md, and .html files can be imported.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Add documents */}
      <div className="card mb-4">
        <h3 className="text-sm font-semibold text-neutral-300 mb-3">Add Documents</h3>
        <div className="flex flex-col gap-3">
          <button
            onClick={addFiles}
            disabled={loading === 'file'}
            className="btn btn-secondary w-full"
          >
            {loading === 'file' ? (
              <><Loader2 size={14} className="animate-spin" /> Processing…</>
            ) : (
              <><FileText size={14} /> Browse Files (PDF, DOCX, TXT, …)</>
            )}
          </button>

          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addUrl()}
              placeholder="https://example.com/article"
              className="input flex-1"
            />
            <button
              onClick={addUrl}
              disabled={!url.trim() || loading === 'url'}
              className="btn btn-primary"
            >
              {loading === 'url' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <><Link size={14} /> Add URL</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 mb-4">
          <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Document list */}
      {documents.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <FileText size={32} className="text-neutral-700 mb-3" />
          <p className="text-neutral-500 text-sm">No documents yet.</p>
          <p className="text-neutral-600 text-xs mt-1">
            Add PDFs, docs, or links to use as context.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-neutral-600">{documents.length} document{documents.length !== 1 ? 's' : ''}</p>
          {[...documents].reverse().map((doc) => (
            <DocCard key={doc.id} doc={doc} onRemove={removeDocument} />
          ))}
        </div>
      )}
    </div>
  )
}
