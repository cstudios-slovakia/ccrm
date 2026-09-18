import assert from "node:assert/strict";
import test from "node:test";
import type { Lead, Project, ProjectType } from "../types/index.ts";
import {
  asUploadedFiles,
  collectProjectRegistryFiles,
  removeProjectUploadedFile,
  uploadDiskName,
} from "./projectDocuments.ts";

const LEADS: Pick<Lead, "id" | "name">[] = [
  { id: "lead-silvia", name: "Silvia Kováčová" },
];

const TYPE: ProjectType = {
  id: "ptype-roof",
  name: "Rekonštrukcia strechy",
  description: "",
  icon: "Home",
  color: "#4f46e5",
  hasTimeline: false,
  hasGantt: false,
  fileFields: [
    { id: "file_contract", name: "Zmluva" },
    { id: "file_gdpr", name: "Súhlas GDPR" },
  ],
  attributes: [
    { id: "attr-area", name: "Plocha", type: "number", required: false },
    { id: "attr-photos", name: "Fotky", type: "files", required: false },
  ],
};

const untitled = "Untitled project";
const unknownSize = "Unknown size";

const collect = (projects: Project[]) =>
  collectProjectRegistryFiles(projects, [TYPE], LEADS, { untitledProject: untitled, unknownSize });

test("asUploadedFiles accepts arrays and JSON strings, and drops nameless entries", () => {
  assert.deepEqual(asUploadedFiles([{ name: "a.pdf", size: "1 KB", path: "/uploads/a.pdf" }]), [
    { name: "a.pdf", size: "1 KB", path: "/uploads/a.pdf" },
  ]);
  assert.deepEqual(
    asUploadedFiles('[{"name":"b.pdf","size":"2 KB","path":"/uploads/b.pdf"}]'),
    [{ name: "b.pdf", size: "2 KB", path: "/uploads/b.pdf" }],
  );
  assert.deepEqual(asUploadedFiles([{ name: "  ", path: "/uploads/x" }, { size: "1 KB" }]), []);
  assert.deepEqual(asUploadedFiles(null), []);
});

test("uploadDiskName strips the uploads prefix", () => {
  assert.equal(uploadDiskName("/uploads/proj-1_zmluva.pdf"), "proj-1_zmluva.pdf");
  assert.equal(uploadDiskName("proj-1_zmluva.pdf"), "proj-1_zmluva.pdf");
});

test("collectProjectRegistryFiles pairs default-slot uploads with the project and its lead", () => {
  const project: Project = {
    id: "project-1",
    projectTypeId: "ptype-roof",
    name: "Strecha Silvia — etapa 1",
    leadId: "lead-silvia",
    status: "active",
    managers: [],
    data: {
      file_contract: [{ name: "zmluva-strecha.pdf", size: "420 KB", path: "/uploads/zmluva-strecha.pdf" }],
    },
  };

  const rows = collect([project]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].fileName, "zmluva-strecha.pdf");
  assert.equal(rows[0].fileType, "project");
  assert.equal(rows[0].projectId, "project-1");
  assert.equal(rows[0].projectName, "Strecha Silvia — etapa 1");
  assert.equal(rows[0].clientName, "Silvia Kováčová");
  assert.equal(rows[0].slotName, "Zmluva");
  assert.equal(rows[0].slotCustom, false);
  assert.equal(rows[0].filePath, "/uploads/zmluva-strecha.pdf");
});

test("collectProjectRegistryFiles includes custom slots and files attributes without double-counting default slots", () => {
  const project: Project = {
    id: "project-2",
    projectTypeId: "ptype-roof",
    name: "Havarijná oprava",
    leadId: null,
    status: "active",
    managers: [],
    data: {
      file_contract: [{ name: "zmluva.pdf", size: "10 KB", path: "/uploads/zmluva.pdf" }],
      "attr-photos": [{ name: "pred.jpg", size: "1 MB", path: "/uploads/pred.jpg" }],
    },
    customFileFields: [
      {
        id: "pfile_extra",
        name: "Fotodokumentácia",
        files: [{ name: "po.jpg", size: "800 KB", path: "/uploads/po.jpg" }],
      },
    ],
  };

  const rows = collect([project]);
  const names = rows.map(r => r.fileName).sort();
  assert.deepEqual(names, ["po.jpg", "pred.jpg", "zmluva.pdf"]);
  assert.equal(rows.find(r => r.fileName === "po.jpg")?.slotCustom, true);
  assert.equal(rows.find(r => r.fileName === "po.jpg")?.projectName, "Havarijná oprava");
  assert.equal(rows.find(r => r.fileName === "pred.jpg")?.slotName, "Fotky");
  assert.equal(rows.find(r => r.fileName === "zmluva.pdf")?.clientName, "");
});

test("removeProjectUploadedFile drops the file from a default slot and from a custom slot", () => {
  const project: Project = {
    id: "project-3",
    projectTypeId: "ptype-roof",
    name: "Test",
    status: "active",
    managers: [],
    data: {
      file_contract: [
        { name: "keep.pdf", size: "1 KB", path: "/uploads/keep.pdf" },
        { name: "drop.pdf", size: "1 KB", path: "/uploads/drop.pdf" },
      ],
    },
    customFileFields: [
      {
        id: "pfile_extra",
        name: "Extra",
        files: [{ name: "gone.jpg", size: "1 KB", path: "/uploads/gone.jpg" }],
      },
    ],
  };

  const afterDefault = removeProjectUploadedFile(project, "file_contract", false, "/uploads/drop.pdf", "drop.pdf");
  assert.deepEqual(afterDefault.data?.file_contract, [
    { name: "keep.pdf", size: "1 KB", path: "/uploads/keep.pdf" },
  ]);

  const afterCustom = removeProjectUploadedFile(project, "pfile_extra", true, "/uploads/gone.jpg", "gone.jpg");
  assert.deepEqual(afterCustom.customFileFields?.[0].files, []);
});
