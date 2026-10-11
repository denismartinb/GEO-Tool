import "./admin.css";
import type { Metadata } from "next";
import Link from "next/link";
import { requireOperator } from "@/lib/admin/operator";
import { InternalVisitorMark } from "@/components/internal-visitor-mark";

export const metadata: Metadata = {
  title: "Consola de operador · GenScore",
  robots: { index: false, follow: false }
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireOperator();

  return (
    <div className="adm-shell">
      <InternalVisitorMark />
      <div className="adm-opbar">
        <div className="adm-opbar-who">
          <span className="adm-opbar-badge">Modo operador</span>
          <span>{user.email}</span>
        </div>
        <nav className="adm-opbar-links">
          <Link href="/admin/panel">Panel</Link>
          <Link href="/admin/users">Usuarios</Link>
          <Link href="/admin/estudio">Estudio</Link>
          <Link href="/admin/comparar-modelos">Comparar modelos</Link>
          <Link href="/admin/afiliados">Afiliados</Link>
          <Link href="/dashboard">Salir a la consola</Link>
        </nav>
      </div>
      {children}
    </div>
  );
}
