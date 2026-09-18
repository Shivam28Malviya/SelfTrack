import { useTp } from '../../context/TpContext'
import TpLayout from './TpLayout'
import { TpNoAccess } from './States'

/**
 * Hides a screen a role has no business opening. This is a courtesy, not a
 * control: the API refuses the same data independently, per row. Never add a
 * screen whose only protection is this component.
 */
export default function TpGuard({ roles, what, children }) {
  const { loading, role } = useTp()
  if (loading) return children
  if (!roles.includes(role)) {
    return <TpLayout title="No access"><TpNoAccess what={what} /></TpLayout>
  }
  return children
}
