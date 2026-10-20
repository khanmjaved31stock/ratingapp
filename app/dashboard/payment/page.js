import { requirePendingPaymentUser } from "@/lib/payment-page-auth";
import PaymentVerificationForm from "@/components/PaymentVerificationForm";

export const metadata = { title: "Complete Payment | Ratewell" };

export default async function PaymentPage() {
  await requirePendingPaymentUser();
  return <PaymentVerificationForm />;
}
