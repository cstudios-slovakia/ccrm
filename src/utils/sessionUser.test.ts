import assert from "node:assert/strict";
import test from "node:test";
import { adoptableSessionUser } from "./sessionUser.ts";

const anna = { id: "u1", name: "Anna", email: "anna@example.com", role: "Admin", color: "#3b82f6" };
const boris = { id: "u2", name: "Boris", email: "Boris@Example.com", role: "Viewer", color: "#8b5cf6" };

test("a live session adopts the user with the session's e-mail", () => {
  const data = { authenticated: true, sessionUser: { email: "anna@example.com" }, users: [boris, anna] };
  assert.equal(adoptableSessionUser(data), anna);
});

test("the e-mail match ignores case and surrounding spaces", () => {
  const data = { authenticated: true, sessionUser: { email: "  BORIS@example.COM " }, users: [anna, boris] };
  assert.equal(adoptableSessionUser(data), boris);
});

test("an answer that is not explicitly authenticated adopts nobody", () => {
  const users = [anna];
  const sessionUser = { email: "anna@example.com" };
  assert.equal(adoptableSessionUser({ authenticated: false, sessionUser, users }), null);
  assert.equal(adoptableSessionUser({ sessionUser, users }), null);
});

test("a missing or empty session e-mail adopts nobody", () => {
  assert.equal(adoptableSessionUser({ authenticated: true, users: [anna] }), null);
  assert.equal(adoptableSessionUser({ authenticated: true, sessionUser: { email: "" }, users: [anna] }), null);
  assert.equal(adoptableSessionUser({ authenticated: true, sessionUser: { email: null }, users: [anna] }), null);
});

test("an e-mail the users list does not contain adopts nobody", () => {
  const data = { authenticated: true, sessionUser: { email: "ghost@example.com" }, users: [anna, boris] };
  assert.equal(adoptableSessionUser(data), null);
});

test("a missing users list or answer adopts nobody", () => {
  assert.equal(adoptableSessionUser({ authenticated: true, sessionUser: { email: "anna@example.com" } }), null);
  assert.equal(adoptableSessionUser(null), null);
  assert.equal(adoptableSessionUser(undefined), null);
});
