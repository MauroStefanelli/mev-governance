import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModaleModificaGara, TabOffertaCatalogo } from "./GarePage";
import { analizzaOffertaExcel } from "../services/mevService";
jest.mock("../services/mevService", () => ({ analizzaOffertaExcel: jest.fn() }));
beforeEach(() => jest.clearAllMocks());

function select(container, lot) {
  const file = new File(["xlsx"], `lotto-${lot}.xlsx`);
  fireEvent.change(container.querySelector(`#excel-file-mod-${lot}`), { target: { files: [file] } });
  return file;
}
test("selezione non importa, password errata poi corretta consente retry", async () => {
  const save = jest.fn();
  const { container } = render(<ModaleModificaGara gara={{ nome: "Gara", capitolato: { lotti: [{ nome: "Lotto 1" }, { nome: "Lotto 2" }] } }} onSalva={save} onAnnulla={() => {}} />);
  const file = select(container, 1);
  expect(analizzaOffertaExcel).not.toHaveBeenCalled();
  analizzaOffertaExcel.mockRejectedValueOnce(new Error("Password errata"));
  userEvent.click(screen.getAllByText("Importa Excel")[0]);
  expect(await screen.findByText("Password errata")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Password Excel Lotto 1"), { target: { value: "corretta-à" } });
  analizzaOffertaExcel.mockResolvedValueOnce({ ok: true, data: { offertaEconomica: { importoBaseGara: 123456, righe: [{ codice: "TOW01.1" }] }, avvisi: ["Colonna non riconosciuta"] } });
  userEvent.click(screen.getByText("Riprova importazione"));
  await waitFor(() => expect(screen.queryByText("Password errata")).not.toBeInTheDocument());
  expect(analizzaOffertaExcel).toHaveBeenLastCalledWith(file, 1, "corretta-à");
  expect(await screen.findByText("Colonna non riconosciuta")).toBeInTheDocument();
  userEvent.click(screen.getByText("Salva"));
  expect(save.mock.calls[0][0].offertaLotti[1].offertaEconomica.righe).toHaveLength(1);
  expect(save.mock.calls[0][0]).not.toHaveProperty("offertaPasswords");
  expect(save.mock.calls[0][0].capitolato.lotti[0].importoBase).toBe(123456);
  expect(save.mock.calls[0][0].capitolato.lotti[1].importoBase).toBeUndefined();
});

test("importazioni concorrenti di due lotti conservano entrambe e bloccano Salva", async () => {
  let finish1, finish2;
  analizzaOffertaExcel.mockImplementation((file, lot) => new Promise(resolve => { if (lot === 1) finish1 = resolve; else finish2 = resolve; }));
  const save = jest.fn();
  const { container } = render(<ModaleModificaGara gara={{ nome: "Gara" }} onSalva={save} onAnnulla={() => {}} />);
  select(container, 1); select(container, 2);
  const imports = screen.getAllByText("Importa Excel");
  userEvent.click(imports[0]); userEvent.click(imports[1]);
  expect(screen.getByText("Salva")).toBeDisabled();
  await act(async () => finish2({ ok: true, data: { offertaCatalogo: [{ id: "2" }] } }));
  await act(async () => finish1({ ok: true, data: { offertaEconomica: { righe: [{ codice: "TOW01.1" }] } } }));
  userEvent.click(screen.getByText("Salva"));
  const data = save.mock.calls[0][0];
  expect(data.offertaLotti[1].offertaEconomica.righe).toHaveLength(1);
  expect(data.offertaLotti[2].offertaCatalogo).toHaveLength(1);
});


test("catalogo senza ID originale mostra i nomi, senza esporre la chiave tecnica", () => {
  render(<TabOffertaCatalogo offertaLotti={{ 2: { offertaCatalogo: [{
    id: "driver-key-interna", idGenerato: true, nome: "Driver Alpha",
    prezziOfferto: [{ fascia: "Semplice", valore: null }, { fascia: "Medio", valore: null }, { fascia: "Complesso", valore: null }],
  }] } }} lotti={[]} gara={{}} onUpdate={() => {}} />);
  expect(screen.getByText("Driver Alpha")).toBeInTheDocument();
  expect(screen.queryByText("driver-key-interna")).not.toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "ID" })).not.toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "Ambito" })).not.toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Descrizione Driver" })).toBeInTheDocument();
});
