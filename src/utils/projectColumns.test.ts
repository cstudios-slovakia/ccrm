import assert from "node:assert/strict";
import test from "node:test";
import {
  BUILTIN_PROJECT_COLUMNS,
  LOCKED_PROJECT_COLUMN,
  asAttributeList,
  attributeColumnKey,
  attributeIdFromColumnKey,
  isAttributeColumnKey,
  isBooleanCheckbox,
  missingChecklistItems,
  moveProjectColumn,
  projectAttributeSortValue,
  readChecklistValue,
  resolveProjectColumns,
  toStoredColumns,
  visibleProjectColumns,
  writeChecklistValue,
} from "./projectColumns.ts";
import type { ProjectAttribute, ProjectListColumn } from "../types/index.ts";

const attr = (id: string, type: ProjectAttribute["type"], extra: Partial<ProjectAttribute> = {}): ProjectAttribute => ({
  id,
  name: id,
  type,
  required: false,
  ...extra,
});

const keys = (cols: { key: string }[]) => cols.map(c => c.key);

/* -------------------------------------------------------------------------- */
/* Column keys                                                                 */
/* -------------------------------------------------------------------------- */

test("an attribute column key round-trips to its attribute id", () => {
  assert.equal(attributeColumnKey("a1"), "attr:a1");
  assert.equal(attributeIdFromColumnKey("attr:a1"), "a1");
  assert.equal(isAttributeColumnKey("attr:a1"), true);
});

test("a built-in key is not mistaken for an attribute column", () => {
  assert.equal(attributeIdFromColumnKey("status"), null);
  assert.equal(isAttributeColumnKey("status"), false);
  // "attr:" with nothing after it names no attribute.
  assert.equal(attributeIdFromColumnKey("attr:"), null);
});

/* -------------------------------------------------------------------------- */
/* Resolving a saved layout                                                    */
/* -------------------------------------------------------------------------- */

test("a type that was never arranged shows the built-in columns, attributes off", () => {
  const cols = resolveProjectColumns([attr("a1", "textfield")], undefined);
  assert.deepEqual(keys(cols), [...BUILTIN_PROJECT_COLUMNS, "attr:a1"]);
  assert.deepEqual(keys(cols.filter(c => c.visible)), [...BUILTIN_PROJECT_COLUMNS]);
});

test("an empty layout reads the same as none at all", () => {
  assert.deepEqual(
    resolveProjectColumns([attr("a1", "number")], []),
    resolveProjectColumns([attr("a1", "number")], undefined),
  );
});

test("the saved order and visibility are honoured", () => {
  const saved: ProjectListColumn[] = [
    { key: "name", visible: true },
    { key: "status", visible: true },
    { key: "attr:a1", visible: true },
    { key: "type", visible: false },
  ];
  const cols = resolveProjectColumns([attr("a1", "money")], saved);
  assert.deepEqual(keys(cols).slice(0, 4), ["name", "status", "attr:a1", "type"]);
  assert.equal(cols.find(c => c.key === "type")!.visible, false);
  assert.deepEqual(keys(visibleProjectColumns([attr("a1", "money")], saved)).slice(0, 3), ["name", "status", "attr:a1"]);
});

test("an attribute column carries the attribute it shows", () => {
  const a = attr("a1", "select", { options: ["x", "y"] });
  const cols = resolveProjectColumns([a], [{ key: "attr:a1", visible: true }]);
  assert.deepEqual(cols.find(c => c.key === "attr:a1")!.attribute, a);
  // A built-in column has no attribute behind it.
  assert.equal(cols.find(c => c.key === "status")!.attribute, undefined);
});

test("a deleted attribute takes its column with it", () => {
  const saved: ProjectListColumn[] = [
    { key: "name", visible: true },
    { key: "attr:gone", visible: true },
    { key: "status", visible: true },
  ];
  const cols = resolveProjectColumns([], saved);
  assert.equal(cols.some(c => c.key === "attr:gone"), false);
});

test("a built-in missing from an old layout comes back visible", () => {
  // A layout saved before "rating" existed must not hide it forever.
  const saved: ProjectListColumn[] = BUILTIN_PROJECT_COLUMNS
    .filter(k => k !== "rating")
    .map(key => ({ key, visible: true }));
  const cols = resolveProjectColumns([], saved);
  const rating = cols.find(c => c.key === "rating");
  assert.equal(rating?.visible, true);
  // ...and it is appended rather than pushed into the arranged order.
  assert.equal(keys(cols).at(-1), "rating");
});

test("a newly added attribute is offered but stays hidden", () => {
  const saved: ProjectListColumn[] = BUILTIN_PROJECT_COLUMNS.map(key => ({ key, visible: true }));
  const cols = resolveProjectColumns([attr("fresh", "textfield")], saved);
  const fresh = cols.find(c => c.key === "attr:fresh");
  assert.equal(fresh?.visible, false, "adding a field must not widen everyone's table");
});

test("the name column is forced first and visible however the layout was saved", () => {
  const cols = resolveProjectColumns([], [
    { key: "status", visible: true },
    { key: LOCKED_PROJECT_COLUMN, visible: false },
  ]);
  assert.equal(keys(cols)[0], LOCKED_PROJECT_COLUMN);
  assert.equal(cols[0].visible, true);
});

test("a duplicated key is kept once", () => {
  const cols = resolveProjectColumns([], [
    { key: "status", visible: true },
    { key: "status", visible: false },
  ]);
  assert.equal(keys(cols).filter(k => k === "status").length, 1);
});

test("garbage in a stored layout is ignored rather than thrown over", () => {
  const cols = resolveProjectColumns([], [
    { key: "nonsense", visible: true },
    null as any,
    { visible: true } as any,
  ]);
  assert.deepEqual(keys(cols), [...BUILTIN_PROJECT_COLUMNS]);
});

test("storing drops the resolved attribute but keeps order and visibility", () => {
  const cols = resolveProjectColumns([attr("a1", "date")], [{ key: "attr:a1", visible: true }]);
  const stored = toStoredColumns(cols);
  assert.deepEqual(stored[1], { key: "attr:a1", visible: true });
  assert.equal("attribute" in stored[1], false);
  // Round-tripping a resolved layout changes nothing.
  assert.deepEqual(keys(resolveProjectColumns([attr("a1", "date")], stored)), keys(cols));
});

/* -------------------------------------------------------------------------- */
/* Reordering                                                                  */
/* -------------------------------------------------------------------------- */

test("a column drops before or after the one it was dragged onto", () => {
  const cols = [{ key: "name" }, { key: "type" }, { key: "client" }, { key: "status" }];
  assert.deepEqual(keys(moveProjectColumn(cols, "status", "type", "before")), ["name", "status", "type", "client"]);
  assert.deepEqual(keys(moveProjectColumn(cols, "status", "type", "after")), ["name", "type", "status", "client"]);
  // Dragging downwards accounts for the row being lifted out from above.
  assert.deepEqual(keys(moveProjectColumn(cols, "type", "status", "after")), ["name", "client", "status", "type"]);
});

test("nothing displaces the name column, and an unknown key moves nothing", () => {
  const cols = [{ key: "name" }, { key: "type" }, { key: "status" }];
  assert.deepEqual(keys(moveProjectColumn(cols, "status", "name", "before")), ["name", "type", "status"]);
  assert.deepEqual(keys(moveProjectColumn(cols, "name", "status", "after")), ["name", "type", "status"]);
  assert.deepEqual(keys(moveProjectColumn(cols, "ghost", "type", "after")), ["name", "type", "status"]);
});

/* -------------------------------------------------------------------------- */
/* Attribute values                                                            */
/* -------------------------------------------------------------------------- */

test("a list attribute reads the same as an array and as its JSON text", () => {
  // project.data arrives from sync.php as raw text, unlike local state.
  assert.deepEqual(asAttributeList(["a", "b"]), ["a", "b"]);
  assert.deepEqual(asAttributeList('["a","b"]'), ["a", "b"]);
  assert.deepEqual(asAttributeList("not json"), []);
  assert.deepEqual(asAttributeList("[broken"), []);
  assert.deepEqual(asAttributeList(null), []);
});

test("a checkbox is a yes/no box only when it has no options", () => {
  assert.equal(isBooleanCheckbox(attr("c", "checkbox")), true);
  assert.equal(isBooleanCheckbox(attr("c", "checkbox", { options: [] })), true);
  assert.equal(isBooleanCheckbox(attr("c", "checkbox", { options: ["x"] })), false);
  assert.equal(isBooleanCheckbox(attr("c", "select", { options: ["x"] })), false);
});

const ctx = {
  moneyAmount: (raw: unknown) => (typeof raw === "number" ? raw : null),
  contactName: (id: string) => (id === "l1" ? "Ada" : null),
};

test("sorting an attribute column compares numbers as numbers", () => {
  assert.equal(projectAttributeSortValue(attr("n", "number"), "12", ctx), 12);
  assert.equal(projectAttributeSortValue(attr("n", "number"), "1,5", ctx), 1.5);
  assert.equal(projectAttributeSortValue(attr("n", "number"), "", ctx), null);
  assert.equal(projectAttributeSortValue(attr("n", "number"), "abc", ctx), null);
  assert.equal(projectAttributeSortValue(attr("m", "money"), 40, ctx), 40);
});

test("a yes/no box always has a value, so it never sorts as empty", () => {
  assert.equal(projectAttributeSortValue(attr("c", "checkbox"), true, ctx), 1);
  assert.equal(projectAttributeSortValue(attr("c", "checkbox"), false, ctx), 0);
  assert.equal(projectAttributeSortValue(attr("c", "checkbox"), undefined, ctx), 0);
});

test("list attributes sort by their picks, files by how many there are", () => {
  assert.equal(projectAttributeSortValue(attr("c", "checkbox", { options: ["x"] }), '["x","y"]', ctx), "x, y");
  assert.equal(projectAttributeSortValue(attr("c", "checkbox", { options: ["x"] }), [], ctx), null);
  assert.equal(projectAttributeSortValue(attr("f", "files"), '[{"name":"a"},{"name":"b"}]', ctx), 2);
  assert.equal(projectAttributeSortValue(attr("f", "files"), [], ctx), null);
});

test("a checklist reads its plain array and its {checked, extra} shape, raw or as JSON", () => {
  assert.deepEqual(readChecklistValue(["a"]), { checked: ["a"], extra: [] });
  assert.deepEqual(readChecklistValue('["a"]'), { checked: ["a"], extra: [] });
  const withExtra = { checked: ["x"], extra: [{ label: "x", required: true }] };
  assert.deepEqual(readChecklistValue(withExtra), withExtra);
  assert.deepEqual(readChecklistValue(JSON.stringify(withExtra)), withExtra);
  assert.deepEqual(readChecklistValue("{broken"), { checked: [], extra: [] });
  assert.deepEqual(readChecklistValue(undefined), { checked: [], extra: [] });
});

test("a checklist without extras is written back as the plain array", () => {
  assert.deepEqual(writeChecklistValue({ checked: ["a"], extra: [] }), ["a"]);
  const withExtra = { checked: [], extra: [{ label: "x", required: false }] };
  assert.deepEqual(writeChecklistValue(withExtra), withExtra);
  assert.deepEqual(readChecklistValue(writeChecklistValue(withExtra)), withExtra);
});

test("missing boxes are the required ones — the type's and the project's — left unticked", () => {
  const box = attr("c", "checkbox", { options: ["a", "b", "c"], requiredOptions: ["a", "b", "gone"] });
  assert.deepEqual(missingChecklistItems(box, []), ["a", "b"]);
  assert.deepEqual(missingChecklistItems(box, ["a"]), ["b"]);
  assert.deepEqual(
    missingChecklistItems(box, { checked: ["a", "b"], extra: [{ label: "x", required: true }, { label: "y", required: false }] }),
    ["x"],
  );
  assert.deepEqual(missingChecklistItems(attr("c", "checkbox"), false), []);
  assert.deepEqual(projectAttributeSortValue(box, { checked: ["a"], extra: [] }, ctx), "a");
});

test("a contact column sorts by the name, not the id behind it", () => {
  assert.equal(projectAttributeSortValue(attr("k", "contact"), "l1", ctx), "Ada");
  assert.equal(projectAttributeSortValue(attr("k", "contact"), "missing", ctx), null);
  assert.equal(projectAttributeSortValue(attr("k", "contact"), "", ctx), null);
});

test("dates sort as text, because they are stored ISO-first", () => {
  assert.equal(projectAttributeSortValue(attr("d", "date"), "2026-01-05", ctx), "2026-01-05");
  assert.equal(projectAttributeSortValue(attr("d", "date"), null, ctx), null);
  assert.equal(projectAttributeSortValue(attr("s", "textfield"), "hello", ctx), "hello");
});
