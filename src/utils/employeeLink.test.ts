import test from "node:test";
import assert from "node:assert/strict";
import {
  linkedEmployeeOf,
  loginsLinkedElsewhere,
  roleSeesEveryEmployee,
  suggestUserForEmployee,
} from "./employeeLink.ts";

const user = (id: string, email: string, role = "Employee") => ({ id, name: id, email, role }) as any;
const emp = (id: string, userId: string | null = null, email: string | null = null) => ({ id, name: id, userId, email }) as any;

test("the employee linked to a login is found by user id", () => {
  const list = [emp("e1", "u1"), emp("e2")];
  assert.equal(linkedEmployeeOf(list, "u1")?.id, "e1");
  assert.equal(linkedEmployeeOf(list, "nobody"), undefined);
  assert.equal(linkedEmployeeOf(list, null), undefined);
});

test("a login linked to another record is taken; the record's own link is not", () => {
  const list = [emp("e1", "u1"), emp("e2", "u2")];
  assert.deepEqual([...loginsLinkedElsewhere(list, "e1")], ["u2"]);
  assert.deepEqual([...loginsLinkedElsewhere(list, null)].sort(), ["u1", "u2"]);
});

test("an e-mail match is only a suggestion, case-insensitively, and never a taken login", () => {
  const users = [user("u1", "Alice@Example.com"), user("u2", "bob@example.com")];
  assert.equal(suggestUserForEmployee(users, [emp("e1")], "e1", "alice@example.com")?.id, "u1");
  assert.equal(suggestUserForEmployee(users, [emp("e1"), emp("e9", "u1")], "e1", "alice@example.com"), null);
  assert.equal(suggestUserForEmployee(users, [emp("e1")], "e1", ""), null);
  assert.equal(suggestUserForEmployee(users, [emp("e1")], "e1", "stranger@example.com"), null);
});

test("a role with the employees module sees every employee; Employee and unknown roles do not", () => {
  const roles = [
    { name: "HR", permissions: { employees: "view" } },
    { name: "Staff", permissions: { employees: "nothing" } },
  ] as any;
  assert.equal(roleSeesEveryEmployee(roles, "HR"), true);
  assert.equal(roleSeesEveryEmployee(roles, "Staff"), false);
  assert.equal(roleSeesEveryEmployee(roles, "Admin"), true);
  assert.equal(roleSeesEveryEmployee(roles, "Ghost"), false);
});
