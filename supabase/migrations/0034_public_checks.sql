-- 0034_public_checks.sql
--
-- Phase: FREE-CHECKER-1 Fase B (founder-approved 2026-08-15)
--
-- Purpose: the one table behind the anonymous free checker
-- (`/gratis/...`). It does three jobs at once, and that is why it exists at
-- all rather than being avoidable with a cookie or a captcha:
--
--   1. **Contador del límite.** Per-IP, per-domain and — the only one that
--      actually bounds the spend — a GLOBAL daily ceiling. A cookie is
--      cleared in one click and a captcha stops bots, not somebody with a
--      loop; neither can answer "how many anonymous checks has this product
--      run today?", which is the question that decides whether we keep
--      spending.
--   2. **Libro de costes.** Every row is one LLM spend. Without it the
--      checker's cost is invisible until the provider invoices us, which is
--      the failure `.claude/rules/scan.md` already names: "a failure the
--      operator can fix must reach the operator".
--   3. **Registro de leads.** The email, when and only when a visitor asks
--      for their result by email.
--
-- WHY THIS NEEDS A SERVICE-ROLE WRITE, stated plainly because
-- `.claude/rules/supabase.md` forbids exactly this without founder approval:
-- the writer is an anonymous visitor with no session, so there is no
-- `auth.uid()` to key a policy off. The mitigation is not a narrower policy,
-- it is a narrower TABLE: no foreign key to `projects` or `profiles`, no
-- customer data, nothing here joins to anything a customer owns. Leaking
-- this table whole would disclose which domains were checked and when — not
-- one row of anyone's scan data.
--
-- WHY THE IP IS HASHED AND NEVER STORED RAW. An IP address is personal data
-- under GDPR, and we do not need it — we need to count. `ip_hash` is
-- sha256(ip || PUBLIC_CHECK_IP_SALT) computed in the application, with the
-- salt in the environment and never in the database: whoever reads this
-- table cannot reverse it to an IP, and rotating the salt retires every old
-- hash at once. The cost, declared: rotating the salt resets everyone's
-- per-IP window. That is the correct trade for not keeping a log of who
-- looked.
--
-- RLS: enabled with NO policies, which in Postgres denies every row to
-- `anon` and `authenticated`. The service role bypasses RLS and is the only
-- way in. The explicit `revoke` below is belt-and-braces against a future
-- default grant — it is not redundant, it is the line that keeps this table
-- closed if somebody ever adds a permissive policy by habit.
--
-- Apply manually in the Supabase SQL editor, in order, after 0033.

create table if not exists public.public_checks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- El dominio normalizado que escribió el visitante (`cleanDomain`).
  domain text not null,

  -- sha256(ip || salt). Nunca la IP. Ver arriba.
  ip_hash text not null,

  -- pending -> completed | failed. Una fila se escribe ANTES de gastar en el
  -- LLM, de modo que una comprobación que revienta a mitad sigue contando
  -- para el techo: si sólo contaran las completadas, un fallo repetido sería
  -- gasto ilimitado e invisible.
  status text not null default 'pending',

  -- Qué motor respondió. Columna y no constante porque la decisión
  -- (Gemini hoy) es reversible y el libro de costes tiene que saber a
  -- posteriori qué se pagó por cada fila.
  engine text,

  -- El resultado. `null` mientras está pending o si falló.
  brand_mentioned boolean,

  -- Categoría de error auto-escrita por este código, nunca el mensaje crudo
  -- del proveedor (`.claude/rules/gemini.md`, "sanitize all errors").
  error_category text,

  -- Sólo si el visitante pide su resultado por email. Nulo por defecto:
  -- la comprobación no lo exige y el diseño aprobado enseña el resultado
  -- antes de pedir nada.
  email text
);

-- El techo global del día: `count(*) where created_at >= now() - 1 day`.
create index if not exists public_checks_created_idx
  on public.public_checks (created_at desc);

-- Límite por IP dentro de la ventana.
create index if not exists public_checks_ip_created_idx
  on public.public_checks (ip_hash, created_at desc);

-- Límite por dominio: impide que alguien queme el techo del día
-- recomprobando el mismo sitio en bucle.
create index if not exists public_checks_domain_created_idx
  on public.public_checks (domain, created_at desc);

alter table public.public_checks enable row level security;

-- Sin políticas: RLS activo y cero políticas = nadie con sesión (ni sin
-- ella) lee o escribe una sola fila. Sólo el rol de servicio, que salta RLS.
revoke all on table public.public_checks from anon;
revoke all on table public.public_checks from authenticated;
