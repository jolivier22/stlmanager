import { useEffect, useMemo, useState } from 'react'
import { Home, Tags, Star, Settings, BarChart3, RefreshCw, Search } from 'lucide-react'

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8091'

type Folder = {
  name: string
  path: string
  rel: string
  counts?: {
    images: number
    gifs: number
    videos: number
    archives: number
    stls: number
  }
  tags?: string[]
  rating?: number | null
  thumbnail_path?: string | null
}

export default function App() {
  const [health, setHealth] = useState<string>('loading...')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [folders, setFolders] = useState<Folder[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 24

  const query = useMemo(() => q.trim(), [q])

  const loadFolders = async () => {
    setLoading(true)
    try {
      const r = await fetch(`${API_BASE}/folders`)
      const d = await r.json()
      const items: Folder[] = d.items ?? []
      const filtered = query
        ? items.filter(f =>
            (f.name?.toLowerCase().includes(query.toLowerCase())) ||
            (f.path?.toLowerCase().includes(query.toLowerCase()))
          )
        : items
      setFolders(filtered)
      setTotal(filtered.length)
      setPage(1)
    } catch (e) {
      setFolders([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  const doScan = async () => {
    setScanning(true)
    try {
      await fetch(`${API_BASE}/scan`, { method: 'POST' })
      await loadFolders()
    } finally {
      setScanning(false)
    }
  }

  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then(r => r.json())
      .then(d => setHealth(d.status ?? JSON.stringify(d)))
      .catch(() => setHealth('error'))
  }, [])

  useEffect(() => {
    loadFolders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const start = (page - 1) * pageSize
  const visible = folders.slice(start, start + pageSize)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="min-h-screen flex font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-zinc-900 border-r border-zinc-800 p-4 hidden md:flex flex-col gap-2">
        <div className="flex items-center gap-2 text-zinc-100 text-lg font-semibold mb-4">
          <div className="w-6 h-6 rounded bg-zinc-700" />
          STLManager
        </div>
        <NavItem icon={<Home size={18} />} label="Accueil" active />
        <NavItem icon={<Tags size={18} />} label="Tags" />
        <NavItem icon={<Star size={18} />} label="Favoris" />
        <div className="mt-auto" />
        <NavItem icon={<BarChart3 size={18} />} label="Statistiques" />
        <NavItem icon={<Settings size={18} />} label="Configuration" />
      </aside>

      {/* Main */}
      <main className="flex-1">
        {/* Topbar */}
        <div className="sticky top-0 z-10 bg-zinc-950/80 backdrop-blur border-b border-zinc-800">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
              <input
                value={q}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
                placeholder="Recherche projets (nom, chemin)"
                className="w-full pl-9 pr-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-700"
              />
            </div>
            <button onClick={loadFolders} disabled={loading} className="px-3 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700">
              {loading ? 'Recherche…' : 'Rechercher'}
            </button>
            <button onClick={doScan} disabled={scanning} className="px-3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-2">
              <RefreshCw size={16} className={scanning ? 'animate-spin' : ''} />
              {scanning ? 'Scan…' : 'Scanner'}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="text-sm text-zinc-400 mb-3">Backend: {health} · API: {API_BASE}</div>
          <div className="text-zinc-200 mb-4">Total dossiers: {total}</div>

          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map(f => (
              <div key={f.path} className="border border-zinc-800 rounded-lg p-3 bg-zinc-900">
                {/* Titre */}
                <div className="font-semibold text-zinc-100 mb-2 truncate" title={f.name}>{f.name}</div>
                {/* Miniature (hauteur 250px, ratio 3:4 portrait) */}
                <div
                  className="h-[250px] rounded border border-zinc-700 overflow-hidden mx-auto"
                  style={{ aspectRatio: '3 / 4' }}
                >
                  {f.thumbnail_path ? (
                    <img
                      src={`${API_BASE}/files?path=${encodeURIComponent(f.thumbnail_path)}`}
                      alt={f.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-zinc-800" />
                  )}
                </div>
                {/* Rating */}
                {typeof f.rating === 'number' && (
                  <div className="mt-2 text-amber-400 text-sm" aria-label={`note ${f.rating}/5`}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span key={i}>{i < (f.rating ?? 0) ? '★' : '☆'}</span>
                    ))}
                  </div>
                )}
                {/* Tags */}
                {f.tags && f.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {f.tags.map((t, idx) => (
                      <span key={idx} className="px-2 py-0.5 rounded-full text-xs bg-zinc-800 text-zinc-200 border border-zinc-700">{t}</span>
                    ))}
                  </div>
                )}
                {f.counts && (
                  <div className="mt-2 text-xs text-zinc-300 flex flex-wrap gap-2">
                    <span>img: {f.counts.images}</span>
                    <span>gif: {f.counts.gifs}</span>
                    <span>vid: {f.counts.videos}</span>
                    <span>zip: {f.counts.archives}</span>
                    <span>stl: {f.counts.stls}</span>
                  </div>
                )}
              </div>
            ))}
            {!loading && visible.length === 0 && (
              <div className="text-zinc-400">Aucun dossier trouvé.</div>
            )}
          </div>

          {/* Pagination */}
          <div className="mt-6 flex items-center justify-between text-sm text-zinc-300">
            <div>Page {page} / {totalPages}</div>
            <div className="flex items-center gap-2">
              <button
                className="px-3 py-1.5 rounded-md bg-zinc-800 disabled:opacity-50 border border-zinc-700"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >Précédent</button>
              <button
                className="px-3 py-1.5 rounded-md bg-zinc-800 disabled:opacity-50 border border-zinc-700"
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >Suivant</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function NavItem({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <button
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left ${
        active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
      }`}
    >
      <span className="text-zinc-300">{icon}</span>
      <span className="text-sm">{label}</span>
    </button>
  )
}
