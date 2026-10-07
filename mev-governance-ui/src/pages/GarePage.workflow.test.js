import React from "react";
import { render, screen, fireEvent, within, act, waitFor } from "@testing-library/react";
import GarePage, { DettaglioGara } from "./GarePage";
import { getGare, putGara, analizzaCapitolatoGara } from "../services/mevService";
import { itemKey } from "../components/gare/garaWorkflow";
jest.mock("../services/mevService", () => ({ getGare: jest.fn(), putGara: jest.fn(), analizzaCapitolatoGara: jest.fn() }));
beforeEach(() => jest.clearAllMocks());

function fixture() {
  return { nome: "Gara Poste", scadenza: "2099-12-31", capitolato: { fileName: "capitolato.pdf", lotti: [1, 2].map(num => ({
    nome: `Lotto ${num}`, importoBase: num * 1000, documentiRichiesti: [{ nome: `Relazione ${num}`, obbligatorio: true }], requisitiTecnici: [`Requisito ${num}`],
  })) }, offertaLotti: { 2: { excelFileName: "lotto2.xlsx", offertaEconomica: { importoBaseGara: 14860949, righe: [] }, offertaCatalogo: [] } } };
}

test("base d'asta compatta non modificabile e workflow separato per lotto", () => {
  const save = jest.fn();
  function Harness() {
    const [gara, setGara] = React.useState(fixture());
    return <DettaglioGara gara={gara} onUpdate={updated => { save(updated); setGara(updated); }} onBack={() => {}} onDelete={() => {}} />;
  }
  render(<Harness />);
  const overview = screen.getByRole("region", { name: "Lotti della gara" });
  expect(within(overview).queryByRole("spinbutton")).not.toBeInTheDocument();
  expect(within(overview).getByText(/14.860.949,00/)).toBeInTheDocument();
  fireEvent.click(within(overview).getByRole("button", { name: /Lotto 2/ }));
  expect(screen.getByLabelText("Responsabile Relazione 2")).toBeInTheDocument();
  fireEvent.blur(screen.getByLabelText("Responsabile Relazione 2"), { target: { value: "Maria" } });
  const saved = save.mock.calls[0][0];
  expect(saved.capitolato.lotti[0].workflow).toBeUndefined();
  expect(Object.values(saved.capitolato.lotti[1].workflow.documenti)[0].responsabile).toBe("Maria");
  fireEvent.click(screen.getByRole("button", { name: "Verifica requisiti" }));
  fireEvent.change(screen.getByLabelText("Esito Requisito 2"), { target: { value: "Conforme" } });
  expect(save.mock.calls[1][0].capitolato.lotti[1].workflow.requisiti[itemKey("Requisito 2", 0, ["Requisito 2"], "req")].stato).toBe("Conforme");
  fireEvent.click(within(overview).getByRole("button", { name: /Lotto 1/ }));
  expect(screen.getByLabelText("Esito Requisito 1")).toHaveValue("Da verificare");
});

test("gli importi TOW usano la base d'asta letta dall'Excel, anche nei dati già salvati", () => {
  const gara = fixture();
  gara.capitolato.lotti[1].tow = [{ id: "TOW02.1", descrizione: "Analisi", quantita: 410, pesoEffort: 10 }];
  render(<DettaglioGara gara={gara} onUpdate={() => {}} onBack={() => {}} onDelete={() => {}} />);
  fireEvent.click(within(screen.getByRole("region", { name: "Lotti della gara" })).getByRole("button", { name: /Lotto 2/ }));
  expect(screen.getAllByText(/1.486.094,90/).length).toBeGreaterThan(0);
});

test("rianalizzare con lotti riordinati conserva allegati e avanzamento nel lotto originale", async () => {
  const gara = fixture();
  const lotto2 = gara.capitolato.lotti[1];
  lotto2.documentiRichiesti[0]._docAttachment = { name: "risposta-2.pdf" };
  lotto2.workflow = { documenti: { [itemKey(lotto2.documentiRichiesti[0], 0, lotto2.documentiRichiesti)]: { responsabile: "Maria", stato: "Approvato" } } };
  analizzaCapitolatoGara.mockResolvedValue({ analysis: { lotti: [
    { nome: "Lotto 2", documentiRichiesti: [{ nome: "Relazione 2" }] },
    { nome: "Lotto 1", documentiRichiesti: [{ nome: "Relazione 1" }] },
  ] } });
  const save = jest.fn();
  const { container } = render(<DettaglioGara gara={gara} onUpdate={save} onBack={() => {}} onDelete={() => {}} />);
  fireEvent.change(container.querySelector('input[accept=".pdf"]'), { target: { files: [new File(["x"], "nuovo.pdf")] } });
  await waitFor(() => expect(save).toHaveBeenCalled());
  const lotti = save.mock.calls[0][0].capitolato.lotti;
  expect(lotti[0].nome).toBe("Lotto 2");
  expect(lotti[0].importoBase).toBe(14860949);
  expect(lotti[0].documentiRichiesti[0]._docAttachment.name).toBe("risposta-2.pdf");
  expect(Object.values(lotti[0].workflow.documenti)[0].stato).toBe("Approvato");
  expect(lotti[1].documentiRichiesti[0]._docAttachment).toBeNull();
});

test("i salvataggi rapidi rispettano l'ordine e un errore permette di riprovare", async () => {
  const gara = { ...fixture(), id: "gara-test", checklist: [] };
  getGare.mockResolvedValue([gara]);
  let finish;
  putGara.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  putGara.mockRejectedValueOnce(new Error("offline"));
  putGara.mockResolvedValue({});
  render(<GarePage />);
  fireEvent.click(await screen.findByText("Gara Poste"));
  fireEvent.blur(screen.getByLabelText("Responsabile Relazione 1"), { target: { value: "Maria" } });
  await waitFor(() => expect(putGara).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByLabelText("Stato Relazione 1"), { target: { value: "In lavorazione" } });
  expect(putGara).toHaveBeenCalledTimes(1);
  await act(async () => finish({}));
  expect(await screen.findByText("Riprova salvataggio")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Riprova salvataggio"));
  await waitFor(() => expect(putGara).toHaveBeenCalledTimes(3));
  expect(Object.values(putGara.mock.calls[2][0].capitolato.lotti[0].workflow.documenti)[0]).toMatchObject({ responsabile: "Maria", stato: "In lavorazione" });
  await waitFor(() => expect(screen.queryByText("Riprova salvataggio")).not.toBeInTheDocument());
});

test("upload iniziato nel lotto 1 resta nel lotto 1 anche passando al lotto 2", () => {
  const Original = global.FileReader;
  let reader;
  global.FileReader = class { constructor() { reader = this; } readAsDataURL() {} };
  const save = jest.fn();
  try {
    render(<DettaglioGara gara={fixture()} onUpdate={save} onBack={() => {}} onDelete={() => {}} />);
    fireEvent.change(screen.getByLabelText("Allega Relazione 1"), { target: { files: [new File(["x"], "risposta.pdf")] } });
    fireEvent.click(within(screen.getByRole("region", { name: "Lotti della gara" })).getByRole("button", { name: /Lotto 2/ }));
    act(() => reader.onload({ target: { result: "data:application/pdf;base64,eA==" } }));
    expect(save.mock.calls[0][0].capitolato.lotti[0].documentiRichiesti[0]._docAttachment.name).toBe("risposta.pdf");
    expect(save.mock.calls[0][0].capitolato.lotti[1].documentiRichiesti[0]._docAttachment).toBeUndefined();
  } finally { global.FileReader = Original; }
});
