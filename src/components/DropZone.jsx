import { useState } from "react";
import { filesFromDrop } from "../mosaic/files.js";

// A dashed box that accepts dropped files and folders.
export default function DropZone({ onFiles, children }) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={over ? "drop over" : "drop"}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setOver(false);
        onFiles(await filesFromDrop(e.dataTransfer));
      }}
    >
      {children}
    </div>
  );
}
