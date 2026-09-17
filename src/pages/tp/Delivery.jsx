import TpLayout from '../../components/tp/TpLayout'
import { TpNotBuiltYet } from '../../components/tp/States'

export default function TpDelivery() {
  return (
    <TpLayout title="Delivery">
      <section className="tp-panel">
        <h1 className="tp-h1">Delivery</h1>
      </section>
      <TpNotBuiltYet
        screen="Delivery"
        phase="4"
        needs="Tasks, their status history and the estimate-versus-actual figures all come from the task tables, which arrive with the task capture screens."
      />
    </TpLayout>
  )
}
