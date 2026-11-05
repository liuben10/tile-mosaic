// Collect every file from a drag-and-drop, walking into dropped folders.
// Reads dt.items synchronously first: the browser empties them once the drop handler yields.
export async function filesFromDrop(dt) {
  const entries = [...dt.items].map((it) => it.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return [...dt.files];
  const out = [];
  const walk = async (en) => {
    if (en.isFile) out.push(await new Promise((res, rej) => en.file(res, rej)));
    else if (en.isDirectory) {
      const rd = en.createReader();
      let batch;
      do {
        batch = await new Promise((res, rej) => rd.readEntries(res, rej));
        for (const ch of batch) await walk(ch);
      } while (batch.length);
    }
  };
  for (const en of entries) await walk(en);
  return out;
}

// Offer a blob as a download: through the Claude artifact viewer when hosted there, else a plain link.
export async function saveBlob(blob, filename) {
  const dl = window.claude?.use ? await window.claude.use("downloads").catch(() => null) : null;
  if (dl) return dl.save({ filename, data: blob });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
