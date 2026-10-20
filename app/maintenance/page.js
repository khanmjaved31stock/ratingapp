export const metadata = { title: "Maintenance | Ratewell" };

export default function MaintenancePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-5 py-12">
      <section className="max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-12">
        <a href="/" className="text-sm font-semibold text-forest">Ratewell</a>
        <h1 className="mt-6 text-3xl font-semibold">We’ll be right back.</h1>
        <p className="mt-4 leading-7 text-slate-600">The user portal is temporarily undergoing maintenance. Please try again shortly.</p>
      </section>
    </main>
  );
}
