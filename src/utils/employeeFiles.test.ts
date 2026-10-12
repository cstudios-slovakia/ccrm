import test from "node:test";
import assert from "node:assert/strict";
import { employeeFileHref, isPrivateEmployeeFile } from "./employeeFiles.ts";

const key = "private/employees/0123456789abcdef0123456789abcdef.pdf";

test("a storage key is recognised, a public upload link is not", () => {
  assert.equal(isPrivateEmployeeFile({ url: key }), true);
  assert.equal(isPrivateEmployeeFile({ filePath: key }), true);
  assert.equal(isPrivateEmployeeFile({ url: "/uploads/emp_contract_1_x.pdf" }), false);
  assert.equal(isPrivateEmployeeFile({ url: "private/employees/../../config.php" }), false);
  assert.equal(isPrivateEmployeeFile({}), false);
});

test("the download link names the employee and the file id, never the storage key", () => {
  const href = employeeFileHref("pe-a", { id: "pf-a-1", url: key });
  assert.equal(href, "/api/employee_file.php?employee=pe-a&file=pf-a-1");
  assert.ok(!href!.includes("private/employees"));
});

test("ids are URL-encoded and download is opt-in", () => {
  assert.equal(
    employeeFileHref("a b", { id: "x&y", url: key }, { download: true }),
    "/api/employee_file.php?employee=a%20b&file=x%26y&download=1"
  );
});

test("no link without an employee, a file id or a private record", () => {
  assert.equal(employeeFileHref(null, { id: "f", url: key }), null);
  assert.equal(employeeFileHref("pe-a", { url: key }), null);
  assert.equal(employeeFileHref("pe-a", { id: "f", url: "/uploads/old.pdf" }), null);
});
