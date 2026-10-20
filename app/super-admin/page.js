import AuthForm from "@/components/AuthForm";

export const metadata = { title: "Super Admin | Ratewell" };

export default function SuperAdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-forest">
          Restricted access
        </p>
        <h1 className="mb-2 text-3xl font-semibold tracking-tight">
          Super Admin
        </h1>
        <p className="mb-8 text-sm leading-6 text-slate-600">
          Authorized administrators only.
        </p>
        <AuthForm
          role="superAdmin"
          roleLabel="the Super Admin console"
          dashboardPath="/super-admin/dashboard"
          admin
        />
      </section>
    </main>
  );
}
