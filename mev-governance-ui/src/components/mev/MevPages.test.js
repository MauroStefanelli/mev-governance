import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import MevPage from "../../pages/MevPage";
import MevCapPage from "../../pages/MevCapPage";
import * as service from "../../services/mevService";
jest.mock("../../services/mevService", () => ({ ...jest.requireActual("../../services/mevService"), getMevList: jest.fn(), getMevOptions: jest.fn(), getTowImpatto: jest.fn(), getRtiSocieta: jest.fn(), getLastAlign: jest.fn(), updateMev: jest.fn() }));
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
