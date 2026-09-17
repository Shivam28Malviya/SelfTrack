import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { tpGet } from '../lib/tpApi'

const TpContext = createContext(null)

/** Loads the caller's TeamPulse role, linked person and config once per
 *  session. Screens read it instead of re-deriving permissions themselves. */
export function TpProvider({ children }) {
  const [state, setState] = useState({ loading: true, error: '', role: null, person: null, config: null })

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: '' }))
    const [me, cfg] = await Promise.all([tpGet('/me'), tpGet('/config')])
    if (!me.success) {
      setState({ loading: false, error: me.error || 'Could not load your access.', role: null, person: null, config: null })
      return
    }
    setState({
      loading: false,
      error: '',
      role: me.role,
      person: me.person,
      visiblePeople: me.visiblePeople,
      config: cfg.success ? cfg.config : null,
    })
  }, [])

  useEffect(() => { load() }, [load])

  return <TpContext.Provider value={{ ...state, reload: load }}>{children}</TpContext.Provider>
}

export function useTp() {
  const ctx = useContext(TpContext)
  if (!ctx) throw new Error('useTp must be used inside a TpProvider')
  return ctx
}
