import AuthForm from "@/components/AuthForm";
import BannerSlot from "@/components/BannerSlot";
import PortalLogo from "@/components/PortalLogo";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-paper">
      <div className="mx-auto grid min-h-screen max-w-7xl items-center gap-12 px-6 py-12 lg:grid-cols-2 lg:px-12">
        <section className="mx-auto w-full max-w-md">
          <div className="mb-10 flex items-center gap-3">
            <PortalLogo />
            <span className="text-xl font-bold tracking-tight">Ratewell</span>
          </div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-forest">
            Your voice matters
          </p>
          <h1 className="mb-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            Welcome back.
          </h1>
          <p className="mb-8 leading-7 text-slate-600">
            Sign in or create an account to continue to your rating portal.
          </p>
          <AuthForm />
          <p className="mt-4 text-center text-sm">
            <a className="font-semibold text-forest underline" href="/help">Guidelines / Help Center</a>
          </p>
          <BannerSlot slot="header" className="mt-6" />
          <p className="mt-8 text-center text-xs leading-5 text-slate-500">
            Your account details are protected and never displayed publicly.
          </p>
        </section>

        <aside className="hidden min-h-[600px] flex-col justify-between overflow-hidden rounded-[2rem] bg-forest p-12 text-white lg:flex">
          <BannerSlot slot="sidebar" className="mb-5" />
          <div>
            <span className="inline-flex rounded-full border border-white/20 px-4 py-2 text-xs font-medium tracking-wide text-white/80">
              A better way to be heard
            </span>
          </div>
          <div className="max-w-lg">
            <div aria-hidden="true" className="mb-8 flex gap-3">
              <span className="h-16 w-16 rounded-2xl bg-white/10" />
              <span className="mt-7 h-16 w-16 rounded-2xl bg-white/20" />
              <span className="h-16 w-16 rounded-2xl bg-white/10" />
            </div>
            <h2 className="mb-5 text-4xl font-semibold leading-tight">
              Every experience can make a difference.
            </h2>
            <p className="max-w-md leading-7 text-white/70">
              Share thoughtful feedback and help the people and services around
              you grow.
            </p>
          </div>
          <p className="text-sm text-white/50">
            A secure and respectful community.
          </p>
        </aside>
      </div>
    </main>
  );
}
