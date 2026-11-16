import type { AccessResolver } from "./permissions";

/**
 * Permissions resolved for the Agency & Workforce Leasing module (`agency`).
 * Keeps view/edit/delete separated from sensitive personal data (`agency.personal`)
 * and payroll / client billing rates (`agency.payments`).
 */
export interface AgencyRights {
  view: boolean;
  edit: boolean;
  delete: boolean;
  personal: boolean;
  payments: boolean;
  editPersonal: boolean;
  editPayments: boolean;
  canConfigure: boolean;
}

export const FULL_AGENCY_RIGHTS: AgencyRights = {
  view: true,
  edit: true,
  delete: true,
  personal: true,
  payments: true,
  editPersonal: true,
  editPayments: true,
  canConfigure: true,
};

export const agencyRightsFrom = (
  access: Pick<AccessResolver, "isAdmin" | "module" | "can" | "canEdit">
): AgencyRights => {
  const m = access.module("agency");
  const edit = m.edit;
  const personal = m.view && access.can("agency.personal");
  const payments = m.view && access.can("agency.payments");
  return {
    view: m.view,
    edit,
    delete: m.delete,
    personal,
    payments,
    editPersonal: edit && personal,
    editPayments: edit && payments,
    canConfigure: access.isAdmin || access.canEdit("general_config"),
  };
};
