import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-8 px-6 py-16">
      <div className="max-w-2xl space-y-4">
        <p className="kicker">Generative Engine Optimization</p>
        <h1 className="title-xl">GEO Studio</h1>
        <p className="text-[var(--ink-2)]">
          Analiza visibilidad en motores de IA y gestiona tus proyectos GEO desde un panel simple.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/signup" className="btn btn-primary">
          Crear cuenta
        </Link>
        <Link href="/login" className="btn btn-ghost">
          Iniciar sesión
        </Link>
        <Link href="/dashboard" className="btn btn-ghost">
          Ir al panel
        </Link>
      </div>
    </main>
  );
}
