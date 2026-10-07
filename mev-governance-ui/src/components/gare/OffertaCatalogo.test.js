import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import OffertaCatalogo, { calcolaPrezziModifica, aggiornaCatalogoModifica } from "./OffertaCatalogo";

test("mostra tutti i gruppi e modifica il lotto selezionato conservando descrizione e basi", () => {
  const row = { id: "tecnico", nome: "Driver Alpha", descrizione: "Descrizione completa\nSeconda riga",
    prezzoRealizzazioneSemplice: 1200, prezzoRealizzazioneMedio: 2800, prezzoRealizzazioneComplesso: 4800,
    prezzoModificaSemplice: 280, prezzoModificaMedio: 840, prezzoModificaComplesso: 1400,
    prezziOfferto: [{ fascia: "Complesso", valore: 500 }, { fascia: "Medio", valore: null }, { fascia: "Semplice", valore: 100 }],
  };
  const offertaLotti = { 1: { offertaCatalogo: [{ ...row, nome: "Driver Lotto 1" }] }, 2: { offertaCatalogo: [row] } };
  const update = jest.fn();
  render(<OffertaCatalogo offertaLotti={offertaLotti} gara={{ nome: "Gara", offertaLotti }} lotti={[]} onUpdate={update} />);
  fireEvent.click(screen.getByText("Lotto 2"));
  for (const title of ["Base d'asta REALIZZAZIONE", "Base d'asta MODIFICA", "Prezzo offerto REALIZZAZIONE", "Prezzo MODIFICA"])
    expect(screen.getByRole("columnheader", { name: title })).toHaveAttribute("colspan", "3");
  expect(screen.queryByText("tecnico")).not.toBeInTheDocument();
  expect(screen.getByText(/Descrizione completa/)).toBeInTheDocument();
  const cells = within(screen.getByText("Driver Alpha").closest("tr")).getAllByRole("cell");
  expect(cells).toHaveLength(14);
  expect(screen.getByLabelText("Driver Alpha Realizzazione Semplice")).toHaveValue(100);
  fireEvent.change(screen.getByLabelText("Driver Alpha Realizzazione Medio"), { target: { value: "0" } });
  const saved = update.mock.calls[0][0];
  expect(saved.offertaLotti[1]).toBe(offertaLotti[1]);
  expect(saved.offertaLotti[2].offertaCatalogo[0].prezziOfferto.map(p => p.valore)).toEqual([100, 0, 500]);
  expect(saved.offertaLotti[2].offertaCatalogo[0].descrizione).toBe(row.descrizione);
  expect(row.prezziOfferto[1].valore).toBeNull();
});

test("calcolo ai centesimi, con vuoto distinto da zero", () => {
  const calc = medio => calcolaPrezziModifica({ prezziOfferto: [{ fascia: "Medio", valore: medio }] }).map(p => p.valore);
  expect(calc(2000)).toEqual([200, 600, 1000]);
  expect(calc(1234.56)).toEqual([123.46, 370.37, 617.28]);
  expect(calc(0.05)).toEqual([0.01, 0.02, 0.03]);
  expect(calc(0)).toEqual([0, 0, 0]);
  for (const value of [null, -1, NaN]) expect(calc(value)).toEqual([null, null, null]);
});

test("aggiorna e salva i prezzi Modifica, poi li cancella quando Medio viene svuotato", () => {
  const row = { nome: "Driver", prezziOfferto: [{ fascia: "Medio", valore: 2000 }],
    prezziOffertoModifica: [{ fascia: "Semplice", valore: 999 }] };
  const initial = { 2: { offertaCatalogo: [row], excelFileName: "Lotto 2.xlsx" } };
  const update = jest.fn();
  const { rerender } = render(<OffertaCatalogo offertaLotti={initial} gara={{}} lotti={[]} onUpdate={update} />);
  expect(screen.getByLabelText("Driver Modifica Semplice").textContent).toContain("200,00");
  fireEvent.change(screen.getByLabelText("Driver Realizzazione Medio"), { target: { value: "1000" } });
  const saved = update.mock.calls[0][0].offertaLotti;
  expect(saved[2].offertaCatalogo[0].prezziOffertoModifica.map(p => p.valore)).toEqual([100, 300, 500]);
  expect(saved[2].excelFileName).toBe("Lotto 2.xlsx");
  rerender(<OffertaCatalogo offertaLotti={saved} gara={{}} lotti={[]} onUpdate={update} />);
  expect(screen.getByLabelText("Driver Modifica Complesso").textContent).toContain("500,00");
  fireEvent.change(screen.getByLabelText("Driver Realizzazione Medio"), { target: { value: "" } });
  expect(update.mock.calls[1][0].offertaLotti[2].offertaCatalogo[0].prezziOffertoModifica.map(p => p.valore)).toEqual([null, null, null]);
  expect(row.prezziOffertoModifica[0].valore).toBe(999);
});

test("normalizza le offerte importate conservando i dati economici", () => {
  const input = { offertaEconomica: { importoBaseGara: 14860949 }, offertaCatalogo: [{ nome: "Driver", prezziOfferto: [{ fascia: "Medio", valore: 2000 }] }] };
  const output = aggiornaCatalogoModifica(input);
  expect(output.offertaEconomica).toBe(input.offertaEconomica);
  expect(output.offertaCatalogo[0].prezziOffertoModifica.map(p => p.valore)).toEqual([200, 600, 1000]);
  expect(input.offertaCatalogo[0].prezziOffertoModifica).toBeUndefined();
});
