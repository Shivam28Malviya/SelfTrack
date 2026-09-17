import { apiCall } from './api'

// All TeamPulse calls go through /api/tp/*. apiCall already adds the /api
// prefix, the bearer token and the 401 redirect.
const qs = (params) => {
  const entries = Object.entries(params || {}).filter(
    ([, v]) => v !== undefined && v !== null && v !== '' && v !== 'All'
  )
  return entries.length ? '?' + new URLSearchParams(entries).toString() : ''
}

export const tpGet = (path, params) => apiCall('GET', `/tp${path}${qs(params)}`)
export const tpPost = (path, body) => apiCall('POST', `/tp${path}`, body)
export const tpPut = (path, body) => apiCall('PUT', `/tp${path}`, body)
export const tpDelete = (path) => apiCall('DELETE', `/tp${path}`)

export const TP_ROLES = ['admin', 'manager', 'member', 'spectator']

/** Screens a role may open. Mirrors docs/teampulse-spec.md section 2 — the
 *  server enforces the same thing per row; this only shapes the nav.
 *  Spectators never reach any of it: the API refuses them at the door. */
export const canOpen = {
  overview: () => true,
  people: () => true,
  delivery: () => true,
  entries: () => true,
  attendance: (role) => role === 'admin' || role === 'manager' || role === 'member',
  skills: () => true,
  entry: (role) => role === 'admin' || role === 'manager',
  settings: (role) => role === 'admin',
}
