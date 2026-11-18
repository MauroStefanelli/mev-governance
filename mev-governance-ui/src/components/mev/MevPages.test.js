import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import MevPage from "../../pages/MevPage";
import MevCapPage from "../../pages/MevCapPage";
import { toOrder } from "./MevTableView";
import * as service from "../../services/mevService";
jest.mock("../../services/mevService", () => ({ ...jest.requireActual("../../services/mevService"), getMevList: jest.fn(), getMevOptions: jest.fn(), getTowImpatto: jest.fn(), getRtiSocieta: jest.fn(), getLastAlign: jest.fn(), updateMev: jest.fn(), rollbackLastAlign: jest.fn() }));
beforeEach(() => {
  localStorage.clear();
  jest.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(3000);
  global.ResizeObserver = class { observe() {} disconnect() {} };
  service.getMevList.mockResolvedValue([
    { id: 1, excelId: 1, goTo: "GOTO-A", applicativo: "Portale", stato: "Approvato", importoExcel: 100, ordinatoBdo: 80, impSubco: 12.5 },
    { id: 2, excelId: 2, goTo: "GOTO-B", applicativo: "Ordini", stato: "In approvazione", importoExcel: 200, ordinatoBdo: 90, impSubco: 25 },
  ]);
  service.getMevOptions.mockResolvedValue({}); service.getTowImpatto.mockResolvedValue({}); service.getRtiSocieta.mockResolvedValue([]); service.getLastAlign.mockResolvedValue(null); service.updateMev.mockClear();
});
afterEach(() => jest.restoreAllMocks());
test.each([["MEV", MevPage, 19, 7], ["MEV-CAP", MevCapPage, 30, 12]])("%s: table alignment, filtered totals and keyboard filters", async (_, Page, count, capCount) => {
  render(<Page ambienteId="1" />);
  await screen.findByRole("region", { name: /Tabella/ });
  const table = screen.getByRole("table"), bands = table.querySelectorAll("thead tr");
  expect(bands).toHaveLength(2); bands.forEach(row => expect(row.children).toHaveLength(count));
  expect(table.querySelector("tbody tr").children).toHaveLength(count);
  expect(screen.getByText("2 Iniziative")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Colonne fisse"), { target: { value: "cap" } });
  expect([...table.querySelector("tbody tr").children].filter(cell => cell.style.position === "sticky")).toHaveLength(capCount);
  fireEvent.change(screen.getByLabelText("Colonne fisse"), { target: { value: "goto" } });
  const summary = screen.getByRole("region", { name: "Riepilogo economico delle iniziative filtrate" });
  expect(within(summary).getByText("€ 37,500")).toBeInTheDocument(); expect(within(summary).getByText("€ 170,000")).toBeInTheDocument();
  const trigger = screen.getByRole("button", { name: /Filtra goTo:/ });
  trigger.focus(); fireEvent.keyDown(trigger, { key: "Enter" }); fireEvent.click(screen.getByRole("checkbox", { name: "GOTO-A" }));
  fireEvent.keyDown(screen.getByRole("dialog", { name: "Seleziona valori filtro" }), { key: "Escape" });
  await waitFor(() => expect(within(summary).getByText("€ 12,500")).toBeInTheDocument());
  expect(table.querySelectorAll("tbody tr")).toHaveLength(1); expect(trigger).toHaveFocus(); expect(service.updateMev).not.toHaveBeenCalled();
});


test("remembers a separate frozen-column preference when returning to each page", async () => {
  let view = render(<MevPage ambienteId="1" />);
  await screen.findByLabelText("Colonne fisse");
  fireEvent.change(screen.getByLabelText("Colonne fisse"), { target: { value: "cap" } });
  view.unmount();
  view = render(<MevCapPage ambienteId="1" />);
  expect(await screen.findByLabelText("Colonne fisse")).toHaveValue("goto");
  fireEvent.change(screen.getByLabelText("Colonne fisse"), { target: { value: "rda" } });
  view.unmount();
  view = render(<MevPage ambienteId="1" />);
  expect(await screen.findByLabelText("Colonne fisse")).toHaveValue("cap");
  view.unmount();
  render(<MevCapPage ambienteId="1" />);
  expect(await screen.findByLabelText("Colonne fisse")).toHaveValue("rda");
});

test("keeps the saved choice on narrow screens and ignores invalid saved values", async () => {
  localStorage.setItem("mevPageFrozenColumns", "rda");
  jest.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(768);
  let view = render(<MevPage ambienteId="1" />);
  expect(await screen.findByLabelText("Colonne fisse")).toHaveValue("rda");
  expect(screen.getByText("Ora: ID/GoTo")).toBeInTheDocument();
  expect(localStorage.getItem("mevPageFrozenColumns")).toBe("rda");
  view.unmount();
  jest.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(3000);
  view = render(<MevPage ambienteId="1" />);
  expect(await screen.findByLabelText("Colonne fisse")).toHaveValue("rda");
  expect(screen.queryByText("Ora: ID/GoTo")).not.toBeInTheDocument();
  view.unmount();
  localStorage.setItem("mevPageFrozenColumns", "obsolete");
  render(<MevPage ambienteId="1" />);
  expect(await screen.findByLabelText("Colonne fisse")).toHaveValue("goto");
});

test.each([["MEV", MevPage], ["MEV-CAP", MevCapPage]])("%s: options follow other filters, allow multiple values and expand after reset", async (_, Page) => {
  service.getMevList.mockResolvedValue([
    { id: 1, goTo: "A", applicativo: "Portale", stato: "Approvato", bc: "ODA-1", atId: "RDA-1", subco: '[3]', capgemini: "x", tipoContratto: "T1", impSubco: 0 },
    { id: 2, goTo: "B", applicativo: "Portale", stato: "In corso", bc: "ODA-2", atId: "RDA-2", subco: '[4]', tipoContratto: "T2", impSubco: 10 },
    { id: 3, goTo: "C", applicativo: "Ordini", stato: "", bc: null, atId: "", subco: "", tipoContratto: "T3", impSubco: 20 },
  ]);
  service.getRtiSocieta.mockResolvedValue([{ id: 3, societa: "Società Alfa" }, { id: 4, societa: "Società Beta" }]);
  render(<Page ambienteId="1" />);
  await screen.findByText("3 Iniziative");
  const open = key => fireEvent.click(screen.getByRole("button", { name: new RegExp(`^Filtra ${key}:`) }));
  const close = () => fireEvent.keyDown(screen.getByRole("dialog", { name: "Seleziona valori filtro" }), { key: "Escape" });
  open("applicativo"); fireEvent.click(screen.getByRole("checkbox", { name: "Portale" })); close();
  open("stato");
  expect(screen.queryByRole("checkbox", { name: "(vuoto)" })).not.toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Approvato" })).toBeInTheDocument(); close();
  open("oda"); fireEvent.click(screen.getByRole("checkbox", { name: "ODA-1" }));
  // A facet excludes its own criterion so another compatible value can be added.
  expect(screen.getByRole("checkbox", { name: "ODA-2" })).toBeInTheDocument(); close();
  expect(screen.getByText("1 Iniziative (filtrate su 3 totali)")).toBeInTheDocument();
  open("subco");
  expect(screen.getByRole("checkbox", { name: "Società Alfa" })).toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "Società Beta" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: "Società Alfa" })); close();
  expect(screen.getByText("1 Iniziative (filtrate su 3 totali)")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Reset filtri/i }));
  expect(screen.getByText("3 Iniziative")).toBeInTheDocument();
  open("stato"); fireEvent.click(screen.getByRole("checkbox", { name: "(vuoto)" })); close();
  open("oda"); expect(screen.getByRole("checkbox", { name: "(vuoto)" })).toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "ODA-1" })).not.toBeInTheDocument(); close();
});

test.each([["MEV", MevPage], ["MEV-CAP", MevCapPage]])("%s: description filters rows and follows the other facets", async (_, Page) => {
  service.getMevList.mockResolvedValue([
    { id: 1, goTo: "A", applicativo: "Portale", descrizione: "Prima attività" },
    { id: 2, goTo: "B", applicativo: "Ordini", descrizione: "Seconda attività" },
    { id: 3, goTo: "C", applicativo: "Portale", descrizione: "Terza attività" },
  ]);
  render(<Page ambienteId="1" />);
  await screen.findByText("3 Iniziative");
  const open = key => fireEvent.click(screen.getByRole("button", { name: new RegExp(`^Filtra ${key}:`) }));
  const close = () => fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  open("applicativo"); fireEvent.click(screen.getByRole("checkbox", { name: "Portale" })); close();
  open("descrizione");
  expect(screen.queryByRole("checkbox", { name: "Seconda attività" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: "Prima attività" }));
  expect(screen.getByRole("checkbox", { name: "Terza attività" })).toBeInTheDocument(); close();
  expect(screen.getByText("1 Iniziative (filtrate su 3 totali)")).toBeInTheDocument();
  open("goTo");
  expect(screen.getByRole("checkbox", { name: "A" })).toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "C" })).not.toBeInTheDocument(); close();
  fireEvent.click(screen.getByRole("button", { name: /Reset filtri/i }));
  expect(screen.getByText("3 Iniziative")).toBeInTheDocument();
});

// «Da Ordinare» = Totale Fornitura − Totale ODA, accanto agli altri totali e prima di Totale SUBCO.
// In MEV la fornitura è la somma di tutte le iniziative filtrate (300) e l'ODA 170; in MEV-CAP la fornitura conta solo le approvate (100) mentre l'ODA tutte le filtrate (170).
test.each([["MEV", MevPage, "€ 130,000", "€ 20,000"], ["MEV-CAP", MevCapPage, "€ -70,000", "€ 20,000"]])("%s: «Da Ordinare» is Totale Fornitura minus Totale ODA, between ODA and SUBCO", async (_, Page, all, one) => {
  render(<Page ambienteId="1" />);
  await screen.findByRole("region", { name: /Tabella/ });
  const summary = screen.getByRole("region", { name: "Riepilogo economico delle iniziative filtrate" });
  const labels = [...summary.children].map(card => card.firstChild.textContent);
  expect(labels).toEqual(["Totale Fornitura", "Totale ODA", "Da Ordinare", "Totale SUBCO"]);
  const card = label => [...summary.children].find(item => item.firstChild.textContent === label);
  expect(card("Da Ordinare").children[1].textContent).toBe(all); expect(card("Da Ordinare").textContent).toContain("Totale Fornitura − Totale ODA");
  const trigger = screen.getByRole("button", { name: /Filtra goTo:/ });
  trigger.focus(); fireEvent.keyDown(trigger, { key: "Enter" }); fireEvent.click(screen.getByRole("checkbox", { name: "GOTO-A" }));
  fireEvent.keyDown(screen.getByRole("dialog", { name: "Seleziona valori filtro" }), { key: "Escape" });
  await waitFor(() => expect(card("Da Ordinare").children[1].textContent).toBe(one));
});
test("toOrder subtracts ODA from the supply, never shows -0 and tolerates missing values", () => {
  expect(toOrder(300, 170)).toBe(130); expect(toOrder(100, 170)).toBe(-70); expect(toOrder(0.3, 0.1 + 0.2)).toBe(0); expect(Object.is(toOrder(0.3, 0.1 + 0.2), -0)).toBe(false);
  expect(toOrder(1234.567, 0.001)).toBe(1234.566); expect(toOrder(1000.125, 0.5)).toBe(999.625); // i millesimi (quelli che si mostrano) non si perdono
  expect(toOrder(undefined, 5)).toBe(-5); expect(toOrder("100", "x")).toBe(100); expect(toOrder(null, null)).toBe(0);
});

// «Annulla ultimo Align» elimina le righe dell'ultimo allineamento (tutte, se l'Align ha caricato l'intero elenco): la conferma deve dirlo, non parlare di «righe aggiornate».
test("MEV: the confirmation of «Annulla ultimo Align» says that rows are deleted and that it cannot be undone, and nothing is deleted if the user refuses", async () => {
  localStorage.setItem("role", "Admin");
  service.getLastAlign.mockResolvedValue({ lastAlignAt: "2026-11-17T14:48:00Z", lastAlignBatchId: "b1" }); service.rollbackLastAlign.mockResolvedValue({ message: "ok" });
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(false); jest.spyOn(window, "alert").mockImplementation(() => {});
  render(<MevPage ambienteId="1" />);
  fireEvent.click(await screen.findByRole("button", { name: /Annulla ultimo Align/ }));
  expect(confirm).toHaveBeenCalledTimes(1);
  const message = confirm.mock.calls[0][0];
  expect(message).toContain("ELIMINATE"); expect(message).toContain("si svuota tutto"); expect(message).toContain("non si può annullare");
  expect(service.rollbackLastAlign).not.toHaveBeenCalled();
  confirm.mockReturnValue(true); fireEvent.click(screen.getByRole("button", { name: /Annulla ultimo Align/ }));
  await waitFor(() => expect(service.rollbackLastAlign).toHaveBeenCalledTimes(1));
});
test("MEV: a Client does not get the «Annulla ultimo Align» button even when an Align exists", async () => {
  localStorage.setItem("role", "Client"); service.getLastAlign.mockResolvedValue({ lastAlignAt: "2026-11-17T14:48:00Z", lastAlignBatchId: "b1" });
  render(<MevPage ambienteId="1" />); await screen.findByRole("region", { name: /Tabella/ });
  expect(screen.queryByRole("button", { name: /Annulla ultimo Align/ })).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: /Allinea Dati/ })).not.toBeInTheDocument();
});

// «Levia HUB S.p.A.» e' una SUBCO. Nel file Excel storico la colonna IET contiene una «x»; l'app la traduceva con la riga numero 2 della tabella RTI & SUBCO,
// che in produzione e' Levia HUB (IET e' la riga 3): Levia HUB compariva tra le Mandanti, e anche togliendola ricompariva alla riapertura.
describe("Mandataria / Mandante: la «x» di IET e' IET, non la SUBCO della riga 2 (dati reali di produzione)", () => {
  const PROD_RTI = [{ id: 1, ruolo: "Mandataria", societa: "Capgemini Italia S.p.A." }, { id: 2, ruolo: "SUBCO", societa: "Levia HUB S.p.A." }, { id: 3, ruolo: "Mandante", societa: "IET" }, { id: 4, ruolo: "SUBCO", societa: "Logica Informatica S.r.L." }];
  const ROW = { id: 282, excelId: 282, goTo: "142379", applicativo: "BEP", descrizione: "Gestione FC Jolly", stato: "Approvato", tipoContratto: "BASE", capgemini: '["Capgemini Italia S.p.A.","IET"]', iet: "x", importoExcel: 100 };
  const open = async () => {
    service.getMevList.mockResolvedValue([ROW, { ...ROW, id: 5, excelId: 5, goTo: "G5", capgemini: "x", iet: "x" }]); service.getRtiSocieta.mockResolvedValue(PROD_RTI);
    render(<MevCapPage ambienteId="1" />); await screen.findByText("2 Iniziative");
  };
  test("la tabella mostra Capgemini e IET, mai Levia HUB, per la riga reale e per una riga con la «x» in entrambe le colonne", async () => {
    await open();
    const table = screen.getByRole("table"); const body = within(table.querySelector("tbody"));
    expect(body.queryByText("Levia HUB S.p.A.")).not.toBeInTheDocument();
    expect(body.getAllByText("IET").length).toBeGreaterThanOrEqual(2); expect(body.getAllByText("Capgemini Italia S.p.A.").length).toBeGreaterThanOrEqual(2);
  });
  test("la scheda «Modifica MEV» non propone Levia HUB come Mandataria/Mandante", async () => {
    await open();
    fireEvent.click(screen.getByText("142379")); const dialog = await screen.findByRole("dialog", { name: /Modifica MEV/ }).catch(() => document.body);
    const text = document.body.textContent;
    expect(text).toContain("Mandataria / Mandante"); const section = [...document.querySelectorAll("*")].find(el => el.textContent.startsWith("Mandataria / Mandante") && el.children.length < 6) || dialog;
    expect(section.textContent).not.toContain("Levia HUB");
  });
  test("la lista di IET si puo' togliere e al salvataggio si manda la lista senza IET", async () => {
    await open(); service.updateMev.mockResolvedValue({ ...ROW, capgemini: "Capgemini Italia S.p.A." });
    fireEvent.click(screen.getByText("142379"));
    fireEvent.click(await screen.findByRole("button", { name: /Salva modifiche/ }));
    await waitFor(() => expect(service.updateMev).toHaveBeenCalled());
    const sent = service.updateMev.mock.calls[0][1];
    expect(sent.capgemini).toBe('["Capgemini Italia S.p.A.","IET"]'); expect(String(sent.capgemini)).not.toContain("Levia");
  });
});

describe("MEV: la scheda in sola lettura usa IET e non la SUBCO della riga 2", () => {
  const PROD_RTI = [{ id: 1, ruolo: "Mandataria", societa: "Capgemini Italia S.p.A." }, { id: 2, ruolo: "SUBCO", societa: "Levia HUB S.p.A." }, { id: 3, ruolo: "Mandante", societa: "IET" }, { id: 4, ruolo: "SUBCO", societa: "Logica Informatica S.r.L." }];
  beforeEach(() => {
    service.getMevList.mockResolvedValue([{ id: 282, excelId: 282, goTo: "142379", applicativo: "BEP", stato: "Approvato", capgemini: '["Capgemini Italia S.p.A.","IET"]', iet: "x", importoExcel: 100 },
      { id: 5, excelId: 5, goTo: "G5", applicativo: "ILP", stato: "Approvato", capgemini: "x", iet: "x", importoExcel: 50 }]);
    service.getRtiSocieta.mockResolvedValue(PROD_RTI);
  });
  test("la scheda della riga elenca IET come Mandante e non la SUBCO", async () => {
    render(<MevPage ambienteId="1" />); await screen.findByText("2 Iniziative");
    fireEvent.click(screen.getByText("142379"));
    const dialog = document.body.textContent; expect(dialog).toContain("IET"); expect(dialog).not.toContain("Levia HUB");
  });
});
