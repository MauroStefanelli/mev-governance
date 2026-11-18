import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { AppPermissionsPanel } from "./AdminPage";
import * as service from "../services/mevService";
jest.mock("../services/mevService", () => new Proxy({}, { get: (_, name) => (name === "__esModule" ? true : (() => Promise.resolve([]))) }));

// The matrix works on the ROLE a user has on the contract. A Client created by the old code had «Editor» there and so saw pages the matrix denies to a Client:
// the page must say what the table applies to, or nobody can tell why a Client sees too much.
test("the permission matrix says it applies to the role on the contract, and what to check when a Client sees too much", async () => {
  render(<AppPermissionsPanel />);
  expect(await screen.findByText("Configurazione accessi per sotto-applicazione")).toBeInTheDocument();
  expect(screen.getByText(/ruolo che l.utente ha sul contratto/)).toBeInTheDocument();
  expect(screen.getByText(/almeno uno dei suoi ruoli permette/)).toBeInTheDocument();
  expect(screen.getByText(/abbia il solo ruolo Client/)).toBeInTheDocument();
  expect(service.getAppRolePermissions).toBeDefined();
});
