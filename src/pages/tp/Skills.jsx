import TpLayout from '../../components/tp/TpLayout'
import { TpNotBuiltYet } from '../../components/tp/States'

export default function TpSkills() {
  return (
    <TpLayout title="Skills">
      <section className="tp-panel">
        <h1 className="tp-h1">Skills</h1>
      </section>
      <TpNotBuiltYet
        screen="Skills"
        phase="6"
        needs="The heatmap needs a skill catalogue an administrator maintains, and both the self and manager ratings, before it means anything."
      />
    </TpLayout>
  )
}
