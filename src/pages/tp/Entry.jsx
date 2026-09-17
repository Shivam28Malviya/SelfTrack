import TpLayout from '../../components/tp/TpLayout'
import { TpNotBuiltYet } from '../../components/tp/States'

export default function TpEntry() {
  return (
    <TpLayout title="Quick log">
      <section className="tp-panel">
        <h1 className="tp-h1">Quick log</h1>
      </section>
      <TpNotBuiltYet
        screen="Quick log"
        phase="3"
        needs="Every entry type needs its validation rules wired to the server, plus an editable entry list and an audit view — a log you cannot correct is worse than no log."
      />
    </TpLayout>
  )
}
