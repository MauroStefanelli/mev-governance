import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import GaraSections, { buildSectionsTree } from "./GaraSections";

test("1, 1.4 e 1.4.1 restano annidati e il clic sul paragrafo mostra la sua sintesi", () => {
  const { container } = render(<GaraSections sections={[
    { numero: "1.4.1", titolo: "1.4.1 - Lotto 1 - Il contesto della tracciatura", sintesi: "I sistemi gestiscono la tracciatura e gli eventi degli invii postali." },
    { numero: "1", titolo: "Ambito di riferimento", sintesi: "Ambito dei servizi richiesti." },
    { numero: "1.4", titolo: "Contesto Applicativo", sintesi: "Descrizione dei sistemi coinvolti." },
  ]} />);
  const first = container.querySelector("details");
  expect(first.querySelector(":scope > summary")).toHaveTextContent("1 — Ambito di riferimento");
  const second = first.querySelector(":scope > details");
  expect(second.querySelector(":scope > summary")).toHaveTextContent("1.4 — Contesto Applicativo");
  const leaf = second.querySelector(":scope > details");
  expect(leaf.querySelector(":scope > summary")).toHaveTextContent("1.4.1 — Lotto 1 - Il contesto della tracciatura");
  const summary = screen.getByText("I sistemi gestiscono la tracciatura e gli eventi degli invii postali.");
  expect(summary).not.toBeVisible();
  for (const section of [first, second, leaf]) fireEvent.click(section.querySelector(":scope > summary"));
  expect(summary).toBeVisible();
  fireEvent.click(leaf.querySelector(":scope > summary"));
  expect(summary).not.toBeVisible();
});

test("recupera i titoli degli antenati dai riferimenti senza aggiungere paragrafi di altri lotti", () => {
  const roots = buildSectionsTree([{ numero: "1.4.1", titolo: "Lotto 1", sintesi: "Contenuto Lotto 1" }], [
    { numero: "1", titolo: "Ambito di riferimento" },
    { numero: "1.4", titolo: "Contesto Applicativo" },
    { numero: "1.4.2", titolo: "Lotto 2", sintesi: "Contenuto Lotto 2" },
  ]);
  expect(roots[0].section.titolo).toBe("Ambito di riferimento");
  expect(roots[0].children[0].section.titolo).toBe("Contesto Applicativo");
  expect(roots[0].children[0].children.map(n => n.number)).toEqual(["1.4.1"]);
});

test("ordina ogni livello numericamente, gestisce duplicati e antenati mancanti senza inventare titoli", () => {
  const roots = buildSectionsTree([
    { numero: "1.4.10", titolo: "Dieci" }, { numero: "1.4.2", titolo: "Due", sintesi: "Contenuto" },
    { numero: "1.4.2.", titolo: "Due", sintesi: "" }, { titolo: "Appendice", sintesi: "Appendice non numerata" },
  ]);
  const first = roots.find(n => n.number === "1");
  expect(first.section.titolo).toBeUndefined();
  expect(first.children[0].children.map(n => n.number)).toEqual(["1.4.2", "1.4.10"]);
  expect(first.children[0].children[0].section.sintesi).toBe("Contenuto");
  const { container } = render(<GaraSections sections={[{ numero: "1.4.1", titolo: "Paragrafo" }]} />);
  expect(container.querySelector("summary")).toHaveTextContent("1 — Titolo non disponibile");
  const leaf = screen.getByText("1.4.1 — Paragrafo").closest("details");
  expect(within(leaf).getByText(/Sintesi non disponibile/)).toBeInTheDocument();
});
