import TpLayout from '../../components/tp/TpLayout'
import { TpNotBuiltYet } from '../../components/tp/States'

export default function TpSettings() {
  return (
    <TpLayout title="Settings">
      <section className="tp-panel">
        <h1 className="tp-h1">Settings</h1>
      </section>
      <TpNotBuiltYet
        screen="Settings"
        phase="1"
        needs="Targets, thresholds, the skill catalogue, holidays and regions are all stored in tp_config and are editable through the API today; this screen puts a form on them."
      />
    </TpLayout>
  )
}
