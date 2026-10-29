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
