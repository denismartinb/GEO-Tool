/**
 * Selección de factores TOTP para el arranque de MFA de `/mfa/enroll`.
 *
 * **Existe como función pura y con tests por lo que costó no tenerla.**
 * `supabase.auth.mfa.listFactors()` devuelve `{ all, totp, phone, webauthn }`,
 * y `auth-js` **sólo mete en `totp` los factores VERIFICADOS**
 * (`GoTrueClient._listFactors`: `if (factor.status === 'verified')`). Un factor
 * a medio enrolar existe únicamente en `all`.
 *
 * La primera versión de `/mfa/enroll` buscaba el pendiente en `.totp`, donde no
 * puede estar nunca. Efecto: no lo encontraba jamás, llamaba a `enroll()` en
 * cada visita, y en cuanto quedaba un factor sin verificar el servidor
 * respondía `A factor with the friendly name "" for this user already exists`
 * — dejando `/admin` **inalcanzable de forma permanente**, con la salida de
 * emergencia («generar uno nuevo») también invisible porque dependía de haber
 * encontrado ese mismo pendiente. Lo sufrió el fundador en producción
 * (2026-08-13, log §66).
 *
 * TypeScript lo había avisado: comparar `status === "unverified"` sobre
 * `data.totp` da «types '"verified"' and '"unverified"' have no overlap»,
 * porque el tipo de `totp` ya dice que sólo hay verificados. Ese error se
 * silenció con un cast. De ahí que esto viva aquí, tipado sobre la forma real
 * que devuelve el cliente y no sobre una aserción.
 */

export type TotpFactorLike = {
  id: string;
  factor_type: string;
  status: string;
};

export type ListFactorsLike = {
  all?: TotpFactorLike[] | null;
} | null;

export type TotpFactorSelection = {
  /** Factor ya verificado: la cuenta puede ir directa al desafío. */
  verified: TotpFactorLike | null;
  /** Factor creado pero sin confirmar: hay que reutilizarlo, nunca crear otro. */
  pending: TotpFactorLike | null;
};

export function selectTotpFactors(data: ListFactorsLike): TotpFactorSelection {
  const totp = (data?.all ?? []).filter((factor) => factor.factor_type === "totp");

  return {
    verified: totp.find((factor) => factor.status === "verified") ?? null,
    pending: totp.find((factor) => factor.status !== "verified") ?? null
  };
}
