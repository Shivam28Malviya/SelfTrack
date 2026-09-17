import TpLayout from '../../components/tp/TpLayout'
import { TpNotBuiltYet } from '../../components/tp/States'

export default function TpAttendance() {
  return (
    <TpLayout title="Attendance">
      <section className="tp-panel">
        <h1 className="tp-h1">Attendance</h1>
      </section>
      <TpNotBuiltYet
        screen="Attendance"
        phase="5"
        needs="The team calendar needs a real working-day calendar and holiday table per region, plus the leave and late-login capture flow."
      />
    </TpLayout>
  )
}
