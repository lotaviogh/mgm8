"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Calculadora de margem" },
  { href: "/cacador", label: "Caçador de fornecedores" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="nav" aria-label="Ferramentas">
      <div className="nav-inner">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={pathname === l.href ? "page" : undefined}>
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
