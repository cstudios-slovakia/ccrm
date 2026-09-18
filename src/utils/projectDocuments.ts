/*
  Project uploads, as the documents registry sees them.

  Files uploaded onto a project never used to leave that project's Files tab:
  they lived in `data[slotId]` (the type's default slots, and any "files"
  attribute) or in `customFileFields`. The registry only scanned lead
  timelines, so a contract filed on a project was invisible from Documents.
  This module is the single walk that turns those slots into registry rows,
  each already paired with the project they came from.
*/

import type { Lead, Project, ProjectType, ProjectUploadedFile } from "../types";

export type RegistryFileType = "offer" | "contract" | "invoice" | "project";

export interface ProjectRegistryFile {
  id: string;
  fileName: string;
  fileSize: string;
  fileType: "project";
  /** Preview / download URL, as the slot stored it. */
  filePath: string;
  clientName: string;
  projectId: string;
  projectName: string;
  /** The slot or attribute the file was uploaded into. */
  slotName: string;
  slotId: string;
  slotCustom: boolean;
  uploadedAt: string;
  offerValue: number;
  summary: string;
  source: "project";
}

/** A files-attribute / file-slot payload, whether it arrived as an array or a JSON string. */
export const asUploadedFiles = (raw: unknown): ProjectUploadedFile[] => {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === "string" && raw.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      return [];
    }
  }
  return list.filter((item): item is ProjectUploadedFile => {
    if (!item || typeof item !== "object") return false;
    const name = String((item as ProjectUploadedFile).name ?? "").trim();
    return name.length > 0;
  });
};

/** The basename the delete endpoint expects, from a stored `/uploads/...` path. */
export const uploadDiskName = (pathOrName: string): string => {
  const trimmed = String(pathOrName ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  const base = trimmed.split("/").pop() || trimmed;
  return base;
};

export interface CollectProjectRegistryFilesOptions {
  untitledProject: string;
  unknownSize: string;
}

const pushSlotFiles = (
  into: ProjectRegistryFile[],
  project: Project,
  projectName: string,
  clientName: string,
  slotId: string,
  slotName: string,
  slotCustom: boolean,
  files: ProjectUploadedFile[],
  unknownSize: string,
): void => {
  files.forEach((file, index) => {
    const fileName = String(file.name).trim();
    const filePath = String(file.path ?? "").trim();
    into.push({
      id: `proj:${project.id}:${slotId}:${index}:${fileName}`,
      fileName,
      fileSize: String(file.size ?? "").trim() || unknownSize,
      fileType: "project",
      filePath,
      clientName,
      projectId: project.id,
      projectName,
      slotName,
      slotId,
      slotCustom,
      uploadedAt: String(project.createdAt ?? ""),
      offerValue: 0,
      summary: slotName,
      source: "project",
    });
  });
};

/**
 * Every file sitting on a project, ready to merge into the documents registry.
 * Default slots, custom slots, and "files" attributes are all included; an
 * attribute that shares an id with a default slot is not listed twice.
 */
export const collectProjectRegistryFiles = (
  projects: Project[],
  projectTypes: ProjectType[],
  leads: Pick<Lead, "id" | "name">[],
  options: CollectProjectRegistryFilesOptions,
): ProjectRegistryFile[] => {
  const files: ProjectRegistryFile[] = [];
  const { untitledProject, unknownSize } = options;

  for (const project of projects) {
    const type = projectTypes.find(pt => pt.id === project.projectTypeId);
    // Same fallback order as projectDisplayName: own name, then the paired lead.
    const ownName = String(project.name ?? "").trim();
    const leadId = project.leadId || project.clientId || "";
    const pairedLead = leadId ? leads.find(l => l.id === leadId) : undefined;
    const projectName = ownName || String(pairedLead?.name ?? "").trim() || untitledProject;
    const clientName = String(pairedLead?.name ?? "").trim();

    const seenSlotIds = new Set<string>();

    for (const field of type?.fileFields || []) {
      seenSlotIds.add(field.id);
      pushSlotFiles(
        files,
        project,
        projectName,
        clientName,
        field.id,
        field.name,
        false,
        asUploadedFiles(project.data?.[field.id]),
        unknownSize,
      );
    }

    for (const field of project.customFileFields || []) {
      seenSlotIds.add(field.id);
      pushSlotFiles(
        files,
        project,
        projectName,
        clientName,
        field.id,
        field.name,
        true,
        Array.isArray(field.files) ? asUploadedFiles(field.files) : [],
        unknownSize,
      );
    }

    for (const attr of type?.attributes || []) {
      if (attr.type !== "files" || seenSlotIds.has(attr.id)) continue;
      pushSlotFiles(
        files,
        project,
        projectName,
        clientName,
        attr.id,
        attr.name,
        false,
        asUploadedFiles(project.data?.[attr.id]),
        unknownSize,
      );
    }
  }

  return files;
};

/** Drop one uploaded file from a project's slot, leaving the rest of the project intact. */
export const removeProjectUploadedFile = (
  project: Project,
  slotId: string,
  slotCustom: boolean,
  filePath: string,
  fileName: string,
): Project => {
  const matches = (file: ProjectUploadedFile) => {
    const path = String(file.path ?? "");
    if (filePath) return path === filePath;
    return String(file.name ?? "") === fileName;
  };

  if (slotCustom) {
    return {
      ...project,
      customFileFields: (project.customFileFields || []).map(slot =>
        slot.id === slotId
          ? { ...slot, files: (slot.files || []).filter(f => !matches(f)) }
          : slot,
      ),
    };
  }

  return {
    ...project,
    data: {
      ...(project.data || {}),
      [slotId]: asUploadedFiles(project.data?.[slotId]).filter(f => !matches(f)),
    },
  };
};
