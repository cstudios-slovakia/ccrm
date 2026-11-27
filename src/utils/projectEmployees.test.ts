import test from "node:test";
import assert from "node:assert/strict";
import { projectEmployeeUserNames, projectManagerPickerNames, projectManagerUserNames } from "./projectEmployees.ts";
import type { UserProfile } from "../types";

const u = (name: string, role: string) => ({ name, role, email: `${name}@example.test`, color: "#000" }) as UserProfile;
const users = [u("Tomi", "Project Manager"), u("Erik", "Admin"), u("Eva", "Employee"), u("Ján", "Contractor"), u("Roli", "project manager ")];

test("the PM filter lists users with the Project Manager role", () => {
  assert.deepEqual(projectManagerUserNames(users), ["Tomi", "Roli"]);
});

test("every user who is not a Project Manager counts as an employee", () => {
  assert.deepEqual(projectEmployeeUserNames(users), ["Erik", "Eva", "Ján"]);
});

test("a PM picker offers the Project Managers and keeps a saved name that is not one", () => {
  assert.deepEqual(projectManagerPickerNames(users), ["Tomi", "Roli"]);
  assert.deepEqual(projectManagerPickerNames(users, "Tomi"), ["Tomi", "Roli"]);
  assert.deepEqual(projectManagerPickerNames(users, "Eva"), ["Tomi", "Roli", "Eva"]);
  assert.deepEqual(projectManagerPickerNames(users, "Unassigned"), ["Tomi", "Roli"]);
  assert.deepEqual(projectManagerPickerNames(users, ""), ["Tomi", "Roli"]);
});
