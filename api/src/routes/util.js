export const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s));

// A user-supplied name: trimmed, no control characters, at most 200 characters.
export function cleanName(value, fallback) {
  const s = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200);
  return s || fallback;
}
