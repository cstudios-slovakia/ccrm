import test from "node:test";
import assert from "node:assert/strict";
import { displayEmployeeName, displayPersonName, setNameOrderEmployees, setNameOrderLanguage } from "./nameOrder.ts";

test("a composed name follows the viewer's order, in both directions", () => {
  assert.equal(displayPersonName("János Kovács", "János", "Kovács", true), "Kovács János");
  assert.equal(displayPersonName("Kovács János", "János", "Kovács", false), "János Kovács");
  assert.equal(displayPersonName("", "Michal", "Kováč", false), "Michal Kováč");
});

test("a name typed differently, or without both parts, is shown as stored", () => {
  assert.equal(displayPersonName("Ing. Michal Kováč", "Michal", "Kováč", true), "Ing. Michal Kováč");
  assert.equal(displayPersonName("Recepcia", "", "", true), "Recepcia");
  assert.equal(displayPersonName("", "Michal", "", true), "Michal");
});

test("an employee's composed name is turned around on screen only", () => {
  setNameOrderEmployees([
    { name: "Juraj Benko", firstName: "Juraj", lastName: "Benko" },
    { name: "Studio Nord s.r.o.", firstName: "", lastName: "" },
  ]);
  setNameOrderLanguage("hu");
  assert.equal(displayEmployeeName("Juraj Benko"), "Benko Juraj");
  assert.equal(displayEmployeeName("Studio Nord s.r.o."), "Studio Nord s.r.o.");
  assert.equal(displayEmployeeName("Tomi"), "Tomi");
  setNameOrderLanguage("sk");
  assert.equal(displayEmployeeName("Juraj Benko"), "Juraj Benko");
});
