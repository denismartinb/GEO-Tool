import { describe, expect, it } from "vitest";
import { selectTotpFactors } from "./mfa-factors";

/**
 * Los fixtures reproducen la forma REAL de `listFactors()`: `auth-js` mete
 * todos los factores en `all` y sólo los verificados en `totp`
 * (`GoTrueClient._listFactors`). Un test que rellenara `totp` con un factor
 * `unverified` estaría inventando una respuesta que el cliente no produce
 * jamás — y es justo esa fantasía la que dejó pasar el bug original.
 */
function listFactorsResponse(factors: Array<{ id: string; factor_type: string; status: string }>) {
  return {
    all: factors,
    totp: factors.filter((f) => f.factor_type === "totp" && f.status === "verified"),
    phone: [],
    webauthn: []
  };
}

describe("selectTotpFactors", () => {
  it("finds a half-finished enrolment, which only ever appears in `all`", () => {
    const data = listFactorsResponse([{ id: "f1", factor_type: "totp", status: "unverified" }]);

    // La prueba de que el fixture es fiel: el cliente real deja `totp` vacío aquí.
    expect(data.totp).toHaveLength(0);

    const { verified, pending } = selectTotpFactors(data);
    expect(verified).toBeNull();
    expect(pending?.id).toBe("f1");
  });

  it("finds a verified factor", () => {
    const data = listFactorsResponse([{ id: "f1", factor_type: "totp", status: "verified" }]);

    const { verified, pending } = selectTotpFactors(data);
    expect(verified?.id).toBe("f1");
    expect(pending).toBeNull();
  });

  it("prefers the verified factor when both exist", () => {
    const data = listFactorsResponse([
      { id: "pending", factor_type: "totp", status: "unverified" },
      { id: "done", factor_type: "totp", status: "verified" }
    ]);

    expect(selectTotpFactors(data).verified?.id).toBe("done");
  });

  it("ignores factors of other types", () => {
    const data = listFactorsResponse([
      { id: "p1", factor_type: "phone", status: "unverified" },
      { id: "w1", factor_type: "webauthn", status: "verified" }
    ]);

    expect(selectTotpFactors(data)).toEqual({ verified: null, pending: null });
  });

  it("returns nothing for an account with no factors at all", () => {
    expect(selectTotpFactors(listFactorsResponse([]))).toEqual({ verified: null, pending: null });
  });

  it("survives a null or malformed response instead of throwing", () => {
    expect(selectTotpFactors(null)).toEqual({ verified: null, pending: null });
    expect(selectTotpFactors({})).toEqual({ verified: null, pending: null });
    expect(selectTotpFactors({ all: null })).toEqual({ verified: null, pending: null });
  });

  it("treats any non-verified status as pending, not just the literal 'unverified'", () => {
    const data = listFactorsResponse([{ id: "f1", factor_type: "totp", status: "some_future_status" }]);

    // Reutilizar el factor existente es siempre más seguro que crear otro:
    // crear otro es lo que devuelve el error de nombre duplicado y bloquea
    // /admin de forma permanente.
    expect(selectTotpFactors(data).pending?.id).toBe("f1");
  });
});
