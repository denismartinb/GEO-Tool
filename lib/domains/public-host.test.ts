import { afterEach, describe, expect, it, vi } from "vitest";
import { isPublicHttpsUrl, isPublicIp, rasterImageType } from "./public-host";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn()
}));

const { lookup } = await import("node:dns/promises");
const lookupMock = vi.mocked(lookup);

afterEach(() => {
  vi.clearAllMocks();
});

describe("isPublicIp", () => {
  it("acepta direcciones públicas", () => {
    expect(isPublicIp("8.8.8.8")).toBe(true);
    expect(isPublicIp("93.184.216.34")).toBe(true);
    expect(isPublicIp("2606:2800:220:1:248:1893:25c8:1946")).toBe(true);
  });

  it("rechaza el endpoint de metadatos de la nube", () => {
    // El objetivo clásico de un SSRF en Vercel/AWS/GCP.
    expect(isPublicIp("169.254.169.254")).toBe(false);
  });

  it("rechaza todo el rango privado y de loopback", () => {
    for (const ip of [
      "10.0.0.1",
      "10.255.255.255",
      "127.0.0.1",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "100.64.0.1", // CGNAT
      "0.0.0.0",
      "255.255.255.255",
      "224.0.0.1" // multicast
    ]) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
  });

  it("no se cuela por el borde de los rangos privados", () => {
    // 172.15 y 172.32 SÍ son públicas: el rango privado es 172.16–172.31.
    expect(isPublicIp("172.15.0.1")).toBe(true);
    expect(isPublicIp("172.32.0.1")).toBe(true);
    expect(isPublicIp("11.0.0.1")).toBe(true);
    expect(isPublicIp("100.63.255.255")).toBe(true);
    expect(isPublicIp("100.128.0.1")).toBe(true);
  });

  it("rechaza IPv6 privada, loopback y link-local", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "fe80::1%eth0", "ff02::1"]) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
  });

  it("mira dentro de una IPv4 mapeada en IPv6", () => {
    // Sin esto, ::ffff:169.254.169.254 se saltaría el filtro entero.
    expect(isPublicIp("::ffff:169.254.169.254")).toBe(false);
    expect(isPublicIp("::ffff:10.0.0.1")).toBe(false);
    expect(isPublicIp("::ffff:8.8.8.8")).toBe(true);
  });
});

describe("isPublicHttpsUrl", () => {
  it("acepta https contra un host que resuelve a una IP pública", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    await expect(isPublicHttpsUrl("https://mahou.es/apple-touch-icon.png")).resolves.toBe(true);
  });

  it("rechaza http, aunque el host sea público", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    await expect(isPublicHttpsUrl("http://mahou.es/x.png")).resolves.toBe(false);
  });

  it("rechaza otros esquemas", async () => {
    await expect(isPublicHttpsUrl("file:///etc/passwd")).resolves.toBe(false);
    await expect(isPublicHttpsUrl("gopher://x/1")).resolves.toBe(false);
    await expect(isPublicHttpsUrl("no es una url")).resolves.toBe(false);
  });

  it("rechaza una IP literal, aunque sea pública", async () => {
    // Lo que manejamos son dominios; una IP literal nunca es entrada legítima.
    await expect(isPublicHttpsUrl("https://8.8.8.8/x.png")).resolves.toBe(false);
    await expect(isPublicHttpsUrl("https://[::1]/x.png")).resolves.toBe(false);
  });

  it("rechaza un host que resuelve a una IP interna", async () => {
    // El caso nip.io / rebind estático: dominio público, IP privada.
    lookupMock.mockResolvedValue([{ address: "169.254.169.254", family: 4 }] as never);
    await expect(isPublicHttpsUrl("https://metadata.evil.com/x.png")).resolves.toBe(false);
  });

  it("rechaza si CUALQUIERA de las direcciones es interna, no sólo la primera", async () => {
    // Un host con un registro público y otro privado pasaría el filtro si sólo
    // se mirase la primera, y luego el sistema podría conectar a la segunda.
    lookupMock.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 }
    ] as never);
    await expect(isPublicHttpsUrl("https://mixto.evil.com/x.png")).resolves.toBe(false);
  });

  it("rechaza un host que no resuelve", async () => {
    lookupMock.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(isPublicHttpsUrl("https://no-existe.invalid/x.png")).resolves.toBe(false);
  });

  it("rechaza un host sin direcciones", async () => {
    lookupMock.mockResolvedValue([] as never);
    await expect(isPublicHttpsUrl("https://vacio.com/x.png")).resolves.toBe(false);
  });
});

describe("rasterImageType", () => {
  function sig(bytes: number[]): Uint8Array {
    const out = new Uint8Array(16);
    out.set(bytes);
    return out;
  }

  it("reconoce los formatos ráster por su firma", () => {
    expect(rasterImageType(sig([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(rasterImageType(sig([0xff, 0xd8, 0xff]))).toBe("image/jpeg");
    expect(rasterImageType(sig([0x47, 0x49, 0x46, 0x38]))).toBe("image/gif");
    expect(rasterImageType(sig([0x00, 0x00, 0x01, 0x00]))).toBe("image/x-icon");

    const webp = sig([0x52, 0x49, 0x46, 0x46]);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(rasterImageType(webp)).toBe("image/webp");
  });

  it("rechaza un SVG aunque sea una imagen válida", () => {
    // Decisión deliberada: un SVG puede llevar script y lo serviríamos desde
    // nuestro propio origen. Nitidez no vale un XSS.
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">');
    expect(rasterImageType(svg)).toBeNull();
  });

  it("rechaza HTML disfrazado de imagen", () => {
    // Un servidor puede devolver Content-Type: image/png con una página de
    // error dentro. La cabecera la escribe él; la firma no.
    const html = new TextEncoder().encode("<!DOCTYPE html><html><body>404");
    expect(rasterImageType(html)).toBeNull();
  });

  it("rechaza un cuerpo demasiado corto para tener firma", () => {
    expect(rasterImageType(new Uint8Array([0x89, 0x50]))).toBeNull();
    expect(rasterImageType(new Uint8Array())).toBeNull();
  });
});
