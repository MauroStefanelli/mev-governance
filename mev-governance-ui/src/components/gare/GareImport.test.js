import React, { useState } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LottoFilePicker from "./LottoFilePicker";
import GaraSections from "./GaraSections";

function Pickers() {
  const [files, setFiles] = useState({});
  return <>{[1, 2].map(lot => <div key={lot} data-testid={`lot-${lot}`}>
    <LottoFilePicker caption="📦 Catalogo (PDF)" file={files[lot]} savedName={lot === 1 ? "vecchio.pdf" : null}
      onChange={file => setFiles(prev => ({ ...prev, [lot]: file }))} accept=".pdf" />
    {files[lot] && <button onClick={() => setFiles(prev => { const next = { ...prev }; delete next[lot]; return next; })}>Rimuovi</button>}
  </div>)}</>;
}

test("nome completo aggiornato per lotto, ID univoci, riselezione e rimozione", () => {
  render(<Pickers />);
  const first = screen.getByTestId("lot-1"); const second = screen.getByTestId("lot-2");
  const input1 = first.querySelector("input"); const input2 = second.querySelector("input");
  expect(input1.id).not.toBe(input2.id);
  expect(first.querySelector("label").htmlFor).toBe(input1.id);
  const file = new File(["pdf"], "catalogo-con-un-nome-molto-lungo-lotto-1.pdf", { type: "application/pdf" });
  fireEvent.change(input1, { target: { files: [file] } });
  expect(first.querySelector("label")).toHaveTextContent(file.name);
  expect(second.querySelector("label")).toHaveTextContent("Catalogo (PDF)");
  fireEvent.change(input1, { target: { files: [] } });
  expect(first.querySelector("label")).toHaveTextContent(file.name);
  fireEvent.change(input1, { target: { files: [file] } });
  expect(first.querySelector("label")).toHaveTextContent(file.name);
  userEvent.click(within(first).getByText("Rimuovi"));
  expect(first.querySelector("label")).toHaveTextContent("vecchio.pdf");
});

test("sezioni senza sintesi espandibili, sintesi padre e ordine 1.2 prima di 1.10", () => {
  const { container } = render(<GaraSections sections={[
    { numero: "1", titolo: "Servizi", sintesi: "Sintesi del padre" },
    { numero: "1.10", titolo: "Dieci", sintesi: "" },
    { numero: "1.2", titolo: "Due", sintesi: "Sintesi due" },
    { numero: "2", titolo: "Vincoli", sintesi: "   " },
  ]} />);
  expect(screen.getByText("Sintesi del padre")).toBeInTheDocument();
  const root = container.querySelector("details");
  userEvent.click(root.querySelector("summary"));
  expect(root.open).toBe(true);
  expect([...root.querySelectorAll(":scope > details > summary")].map(s => s.textContent)).toEqual(["1.2 — Due", "1.10 — Dieci"]);
  const empty = screen.getByText("2 — Vincoli").closest("details");
  userEvent.click(empty.querySelector("summary"));
  expect(empty.open).toBe(true);
  expect(within(empty).getByText(/Sintesi non disponibile/)).toBeInTheDocument();
});
