import { NextResponse } from "next/server";
import { ANDROID_PACKAGE } from "@/lib/app-mode";

/**
 * ANDROID-TWA-1 · Digital Asset Links. Es lo que permite que Chrome abra la web
 * dentro de la app de Android sin barra de direcciones. Las huellas SHA-256 del
 * certificado de firma (la de subida y la de Play App Signing) van separadas por
 * comas en `ANDROID_SHA256_CERT_FINGERPRINTS`; sin ellas devuelve una lista
 * vacía, que es válida pero no verifica ninguna app.
 */
export const dynamic = "force-static";

export function GET() {
  const fingerprints = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS ?? "")
    .split(",")
    .map((f) => f.trim().toUpperCase())
    .filter((f) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f));

  const body = fingerprints.length
    ? [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: ANDROID_PACKAGE,
            sha256_cert_fingerprints: fingerprints
          }
        }
      ]
    : [];

  return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
