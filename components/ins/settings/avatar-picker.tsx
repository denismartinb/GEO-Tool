"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ic } from "@/components/ins/ic";
import { removeAvatar, uploadAvatar } from "@/app/dashboard/settings/profile/actions";

const SIZE = 256;

/** Recorta al centro y reduce a un JPEG cuadrado de 256 px: pesa unos 20 KB y se sube casi al instante. */
async function toSquareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("blob"))), "image/jpeg", 0.85),
  );
}

/**
 * Avatar de Ajustes. Un clic abre el selector estándar del sistema (en el móvil,
 * galería o cámara); el navegador reduce la imagen y la acción de servidor la
 * guarda en el bucket privado `avatars` (migración 0046).
 */
export function AvatarPicker({ initials, url }: { initials: string; url: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    start(async () => {
      try {
        const blob = await toSquareJpeg(file);
        const body = new FormData();
        body.set("file", new File([blob], "avatar.jpg", { type: "image/jpeg" }));
        const result = await uploadAvatar(body);
        if (!result.success) setError(result.error);
        else router.refresh();
      } catch {
        setError("No se pudo leer esa imagen. Prueba con otra.");
      }
    });
  }

  return (
    <div className="st-avwrap">
      <button
        type="button"
        className={`av st-av st-avbtn${url ? " xo-avimg" : ""}`}
        style={url ? { backgroundImage: `url("${url}")` } : undefined}
        aria-label={url ? "Cambiar foto de perfil" : "Subir foto de perfil"}
        disabled={pending}
        onClick={() => input.current?.click()}
      >
        {url ? null : initials}
        <span className="st-cam" aria-hidden="true">
          <Ic n="c-camera" sm />
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {url ? (
        <button
          type="button"
          className="st-avrm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await removeAvatar();
              if (!result.success) setError(result.error);
              else router.refresh();
            })
          }
        >
          Quitar foto
        </button>
      ) : null}
      {error ? (
        <p className="st-averr" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
