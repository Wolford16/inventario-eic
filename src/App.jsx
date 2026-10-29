import { useState, useEffect, useMemo } from 'react'
import { db } from './firebase'
import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  onSnapshot
} from 'firebase/firestore'
import './App.css'

const COLLECTION = 'bienes'

export default function App() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('ubicaciones') // 'ubicaciones' | 'desplazados' | 'agregar'
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null) // { type: 'displace', item }
  const [displaceLocation, setDisplaceLocation] = useState('')

  // New item form
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [newLocation, setNewLocation] = useState('')

  // Listen to Firestore in real-time
  useEffect(() => {
    const unsub = onSnapshot(collection(db, COLLECTION), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setItems(data)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  // Derived data
  const locations = useMemo(() => {
    const map = {}
    items.forEach(item => {
      const loc = item.location || 'Sin ubicación'
      if (!map[loc]) map[loc] = { total: 0, verified: 0, missing: 0, displaced: 0, pending: 0 }
      map[loc].total++
      map[loc][item.status || 'pending']++
    })
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [items])

  const allLocations = useMemo(() => {
    return [...new Set(items.map(i => i.location))].filter(Boolean).sort()
  }, [items])

  const filteredItems = useMemo(() => {
    let list = items
    if (selectedLocation) {
      list = list.filter(i => i.location === selectedLocation)
    }
    if (search) {
      const s = search.toLowerCase()
      list = list.filter(i =>
        i.code.toLowerCase().includes(s) ||
        i.name.toLowerCase().includes(s)
      )
    }
    return list
  }, [items, selectedLocation, search])

  const displacedItems = useMemo(() => {
    return items.filter(i => i.status === 'displaced')
  }, [items])

  const stats = useMemo(() => {
    const s = { total: items.length, verified: 0, missing: 0, displaced: 0, pending: 0 }
    items.forEach(i => { s[i.status || 'pending']++ })
    return s
  }, [items])

  // Actions
  async function toggleVerify(item) {
    const newStatus = item.status === 'verified' ? 'pending' : 'verified'
    await updateDoc(doc(db, COLLECTION, item.id), {
      status: newStatus,
      foundLocation: newStatus === 'verified' ? null : item.foundLocation
    })
  }

  async function markMissing(item) {
    const newStatus = item.status === 'missing' ? 'pending' : 'missing'
    await updateDoc(doc(db, COLLECTION, item.id), { status: newStatus })
  }

  function openDisplaceModal(item) {
    setModal({ type: 'displace', item })
    setDisplaceLocation('')
  }

  async function confirmDisplace() {
    if (!displaceLocation || !modal?.item) return
    await updateDoc(doc(db, COLLECTION, modal.item.id), {
      status: 'displaced',
      foundLocation: displaceLocation
    })
    setModal(null)
  }

  async function addItem() {
    if (!newCode.trim() || !newName.trim() || !newLocation.trim()) return
    const id = 'item_' + Date.now()
    await setDoc(doc(db, COLLECTION, id), {
      code: newCode.trim(),
      name: newName.trim().toUpperCase(),
      location: newLocation.trim(),
      status: 'pending',
      foundLocation: null
    })
    setNewCode('')
    setNewName('')
    setNewLocation('')
  }

  async function resetItem(item) {
    await updateDoc(doc(db, COLLECTION, item.id), {
      status: 'pending',
      foundLocation: null
    })
  }

  if (loading) {
    return (
      <div className="app">
        <div className="loading">
          <img src="/logo-eic.png" alt="Logo EIC" className="loading-logo" />
          <div className="spinner"></div>
          <p>Cargando inventario...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <img src="/logo-eic.png" alt="Escuela de Investigación Criminal" className="header-logo" />
        <div className="header-text">
          <h1>Escuela de Investigación Criminal · EIC</h1>
          <p>Sistema de Verificación y Ordenamiento de Bienes</p>
        </div>
      </header>

      {/* Stats */}
      <div className="stats-bar">
        <div className="stat">
          <div className="stat-number">{stats.total}</div>
          <div className="stat-label">Total</div>
        </div>
        <div className="stat">
          <div className="stat-number verified">{stats.verified}</div>
          <div className="stat-label">Verificados</div>
        </div>
        <div className="stat">
          <div className="stat-number missing">{stats.missing}</div>
          <div className="stat-label">No encontrados</div>
        </div>
        <div className="stat">
          <div className="stat-number displaced">{stats.displaced}</div>
          <div className="stat-label">Desplazados</div>
        </div>
        <div className="stat">
          <div className="stat-number pending">{stats.pending}</div>
          <div className="stat-label">Pendientes</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${tab === 'ubicaciones' ? 'active' : ''}`} onClick={() => { setTab('ubicaciones'); setSelectedLocation(null) }}>
          📍 Ubicaciones
        </button>
        <button className={`tab ${tab === 'desplazados' ? 'active' : ''}`} onClick={() => setTab('desplazados')}>
          ⚠️ Desplazados ({displacedItems.length})
        </button>
        <button className={`tab ${tab === 'agregar' ? 'active' : ''}`} onClick={() => setTab('agregar')}>
          ➕ Agregar Bien
        </button>
      </div>

      {/* TAB: Ubicaciones */}
      {tab === 'ubicaciones' && !selectedLocation && (
        <div className="locations-grid">
          {locations.map(([loc, counts]) => (
            <div key={loc} className="location-card" onClick={() => setSelectedLocation(loc)}>
              <h3>{loc}</h3>
              <div className="location-stats">
                <span><span className="dot green"></span> {counts.verified}</span>
                <span><span className="dot red"></span> {counts.missing}</span>
                <span><span className="dot yellow"></span> {counts.displaced}</span>
                <span><span className="dot gray"></span> {counts.pending}</span>
                <span style={{ marginLeft: 'auto' }}>{counts.total} bienes</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${counts.total ? ((counts.verified / counts.total) * 100) : 0}%` }}></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB: Items list for a location */}
      {tab === 'ubicaciones' && selectedLocation && (
        <div>
          <button className="back-btn" onClick={() => setSelectedLocation(null)}>
            ← Volver a ubicaciones
          </button>
          <div className="items-header">
            <h2>{selectedLocation}</h2>
            <input
              className="search-box"
              placeholder="Buscar por código o nombre..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="items-list">
            {filteredItems.length === 0 && (
              <div className="empty-state">No se encontraron bienes</div>
            )}
            {filteredItems.map(item => (
              <div key={item.id} className={`item-row ${item.status || 'pending'}`}>
                <input
                  type="checkbox"
                  className="item-check"
                  checked={item.status === 'verified'}
                  onChange={() => toggleVerify(item)}
                  title="Marcar como verificado"
                />
                <span className="item-code">{item.code}</span>
                <span className="item-name">{item.name}</span>
                <span className={`status-badge ${item.status || 'pending'}`}>
                  {item.status === 'verified' && '✓ Verificado'}
                  {item.status === 'missing' && '✗ No encontrado'}
                  {item.status === 'displaced' && `⚠ En: ${item.foundLocation}`}
                  {(!item.status || item.status === 'pending') && 'Pendiente'}
                </span>
                <div className="item-actions">
                  {item.status !== 'displaced' && (
                    <button className="btn-sm warning" onClick={() => openDisplaceModal(item)} title="Está en otra ubicación">
                      Desplazado
                    </button>
                  )}
                  {item.status !== 'missing' && item.status !== 'verified' && (
                    <button className="btn-sm danger" onClick={() => markMissing(item)} title="No se encontró">
                      No está
                    </button>
                  )}
                  {(item.status === 'missing' || item.status === 'displaced') && (
                    <button className="btn-sm" onClick={() => resetItem(item)} title="Resetear estado">
                      Reset
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: Desplazados */}
      {tab === 'desplazados' && (
        <div className="displaced-panel">
          <h2>⚠️ Bienes Desplazados</h2>
          <p className="subtitle">Bienes que están registrados en una ubicación pero se encontraron físicamente en otra</p>
          {displacedItems.length === 0 && (
            <div className="empty-state">No hay bienes desplazados registrados</div>
          )}
          {displacedItems.map(item => (
            <div key={item.id} className="displaced-item">
              <div className="displaced-code">{item.code}</div>
              <div className="displaced-name">{item.name}</div>
              <div className="displaced-locations">
                Registrado en: <strong>{item.location}</strong> → Encontrado en: <span>{item.foundLocation}</span>
              </div>
              <button className="btn-sm" style={{ marginTop: 8 }} onClick={() => resetItem(item)}>
                Resetear
              </button>
            </div>
          ))}
        </div>
      )}

      {/* TAB: Agregar */}
      {tab === 'agregar' && (
        <div className="add-item-panel">
          <h2>Registrar Nuevo Bien</h2>
          <div className="form-row">
            <div className="form-group">
              <label>Código (Control Interno)</label>
              <input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="Ej: 4951515" />
            </div>
            <div className="form-group">
              <label>Nombre / Descripción</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ej: Armario de metal 2 puertas" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Ubicación</label>
              <select value={newLocation} onChange={e => setNewLocation(e.target.value)}>
                <option value="">Seleccionar ubicación...</option>
                {allLocations.map(loc => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn btn-primary" onClick={addItem}>
                ➕ Agregar Bien
              </button>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>O escribir nueva ubicación</label>
              <input
                value={newLocation}
                onChange={e => setNewLocation(e.target.value)}
                placeholder="Ej: P1 · Laboratorio"
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal: Desplazar */}
      {modal?.type === 'displace' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>📍 ¿Dónde se encontró este bien?</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
              <strong>{modal.item.code}</strong> — {modal.item.name}
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Registrado en: <strong>{modal.item.location}</strong>
            </p>
            <label>Ubicación donde se encontró</label>
            <select value={displaceLocation} onChange={e => setDisplaceLocation(e.target.value)}>
              <option value="">Seleccionar...</option>
              {allLocations.filter(l => l !== modal.item.location).map(loc => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={confirmDisplace} disabled={!displaceLocation}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
