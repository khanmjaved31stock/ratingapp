import BannerSlot from "@/components/BannerSlot";

const faqs = [
  {
    question: "How do I join Ratewell?",
    answer: "Create an account, choose an available registration package, and submit the payment details for manual verification.",
  },
  {
    question: "When can I use the rating portal?",
    answer: "Your account becomes active after an administrator verifies your registration payment.",
  },
  {
    question: "How are withdrawals handled?",
    answer: "Save your payout details in account settings, then submit a withdrawal request from your wallet. Each request is reviewed and processed manually.",
  },
];

export const metadata = { title: "About Ratewell" };

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-paper px-5 py-12 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="rounded-3xl bg-forest p-8 text-white sm:p-14">
          <a href="/" className="text-sm text-white/70 hover:text-white">Ratewell</a>
          <p className="mt-12 text-sm font-semibold uppercase tracking-[0.2em] text-white/70">About us</p>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">A thoughtful place for honest experiences.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-white/75">Ratewell helps people share useful feedback about products and services, and gives organizations a clearer way to learn from the experiences they create.</p>
        </header>
        <BannerSlot slot="header" className="my-6" />
        <section className="grid gap-6 py-10 sm:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-7"><h2 className="text-xl font-semibold">Our mission</h2><p className="mt-3 leading-7 text-slate-600">Make feedback more constructive, transparent, and useful. We focus on respectful reviews and clear account protections.</p></article>
          <article className="rounded-2xl border border-slate-200 bg-white p-7"><h2 className="text-xl font-semibold">Our approach</h2><p className="mt-3 leading-7 text-slate-600">We combine moderated feedback with privacy-conscious account management and human review for payments and support.</p></article>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-7 sm:p-9"><h2 className="text-2xl font-semibold">Frequently asked questions</h2><div className="mt-5 divide-y">{faqs.map((faq) => <details key={faq.question} className="py-4"><summary className="cursor-pointer font-semibold">{faq.question}</summary><p className="mt-3 leading-7 text-slate-600">{faq.answer}</p></details>)}</div></section>
        <footer className="py-10 text-center text-sm text-slate-600">Need help? <a className="font-semibold text-forest underline" href="/">Sign in to contact support</a>.</footer>
      </div>
    </main>
  );
}
