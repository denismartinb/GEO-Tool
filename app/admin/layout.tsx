import "./admin.css";
import type { Metadata } from "next";
import Link from "next/link";
import { requireOperator } from "@/lib/admin/operator";

export const metadata: Metadata = {
  title: "Consola de operador — GenScore",
  robots: { index: false, follow: false }
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireOperator();

  return (
    <div className="adm-shell">
      <div className="adm-opbar">
        <div className="adm-opbar-who">
          <span className="adm-opbar-badge">Modo operador</span>
          <span>{user.email}</span>
        </div>
        <nav className="adm-opbar-links">
          <Link href="/admin/users">Usuarios</Link>
          <Link href="/dashboard">Salir a la consola</Link>
        </nav>
      </div>
      {children}
    </div>
  );
}
