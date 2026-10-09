import React, { useId } from "react";

export default function LottoFilePicker({ file, savedName, onChange, accept, caption, prefix, color = "#1d4ed8", background = "#eff6ff", border = "#93c5fd", disabled = false }) {
  const id = useId();
  const name = file?.name || savedName;
  return (
    <>
      <label htmlFor={id} title={name || caption}
        style={{ background: name ? background : "#fff", color: name ? color : "#6b7280", border: "1px solid " + (name ? border : "#e5e7eb"), borderRadius: 7, padding: "5px 12px", fontSize: 11, fontWeight: 600, cursor: disabled ? "default" : "pointer", display: "inline-block", maxWidth: 320, overflowWrap: "anywhere", opacity: disabled ? 0.6 : 1 }}>
        {name ? `✓ ${prefix || ""}${name}${!file && savedName ? " (già analizzato)" : ""}` : caption}
      </label>
      <input id={id} type="file" accept={accept} disabled={disabled} style={{ display: "none" }}
        onChange={event => {
          const selected = event.currentTarget.files?.[0];
          // Conserva il File prima di azzerare l'input: permette anche di riselezionarlo.
          if (selected) onChange(selected);
          event.currentTarget.value = "";
        }} />
    </>
  );
}
