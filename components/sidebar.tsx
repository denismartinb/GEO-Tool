import Link from "next/link";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/projects", label: "Projects" }
];

export function Sidebar() {
  return (
    <aside className="w-56 border-r bg-white p-4">
      <p className="mb-4 text-sm font-semibold">GEO Studio</p>
      <nav className="space-y-1">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="block rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-100"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
