export function deriveNameFromEmail(email: string) {
  const local = email.split("@")[0] ?? "";
  const words = local
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1));
  return words.length > 0 ? words.join(" ") : "Sin nombre";
}
