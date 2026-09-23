import { useState, useEffect } from "react";
import { getConfiguratoreRecords } from "../services/mevService";

function ConfiguratorePage({ onUnauthorized }) {
  const [records, setRecords] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getConfiguratoreRecords()
      .then(setRecords)
      .catch((err) => {
        if (err && (err.status === 401 || err.status === 403)) onUnauthorized();
        else setError("Impossibile caricare i dati del Configuratore");
      });
  }, []); // eslint-disable-line

  return (
    <div style={{ padding: "20px" }}>
      <h2 style={{ margin: "0 0 6px", fontSize: "18px" }}>Configuratore Offerta</h2>
      <p style={{ margin: "0 0 16px", color: "#666", fontSize: "13px" }}>
        L'integrazione del Configuratore Offerta sarà completata qui (Fase 2).
      </p>
      {error && <p style={{ color: "#b00020", fontSize: "13px" }}>{error}</p>}
      {records !== null && (
        <p style={{ fontSize: "13px", color: "#333" }}>
          Record salvati in PC_DataRecords: <b>{records.length}</b>
        </p>
      )}
    </div>
  );
}

export default ConfiguratorePage;