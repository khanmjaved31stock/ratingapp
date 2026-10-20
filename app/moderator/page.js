import AuthForm from "@/components/AuthForm";

export const metadata = { title: "Moderator sign in | Ratewell" };

export default function ModeratorLoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-5 py-12">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
        <a href="/" className="text-sm font-semibold text-forest">Ratewell</a>
        <h1 className="mt-5 text-3xl font-semibold">Moderator sign in</h1>
        <p className="mt-2 mb-7 text-sm leading-6 text-slate-600">Authorized staff access only.</p>
        <AuthForm role="moderator" roleLabel="the moderator workspace" dashboardPath="/moderator/dashboard" admin />
      </section>
    </main>
  );
}
