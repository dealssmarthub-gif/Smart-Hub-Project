// A shop's address, /shops/<slug>. The slug is public, so it's made from the shop
// name plus a random suffix and never from the owner's id. Once migration
// 20261029120000 is applied the database makes sellers' slugs itself (same
// shape); this keeps new shops safe before that too.

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** "Ama's Kitchen & Co" -> "amas-kitchen-co-k3f9qz". */
export function makeStoreSlug(name: string, random: () => number = Math.random): string {
  const base =
    name
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/, "") || "shop";
  let suffix = "";
  for (let i = 0; i < 6; i++) suffix += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return `${base}-${suffix}`;
}
