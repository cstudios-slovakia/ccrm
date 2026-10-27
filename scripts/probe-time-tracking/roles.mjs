/**
 * Role records for the time tracking probe. Built from the real registry so a renamed key fails here.
 */
import { ALL_PERMISSION_KEYS, employeeRolePermissions, newRolePermissions } from '../../src/utils/permissions.ts';

const none = () => Object.fromEntries(ALL_PERMISSION_KEYS.map((k) => [k, 'nothing']));

/** Project Manager as the fallback registry has it: tracks time, sees the team, no costs. */
export const PM_ROLE = {
  name: 'Project Manager',
  permissions: { ...none(), tasks: 'edit', 'tasks.view_all': 'edit', projects: 'edit', tickets: 'edit', time_tracking: 'edit', time_tracking_team: 'edit' },
};

/** The native Employee role: own time only; tasks but no projects module. */
export const employeeRole = () => ({ name: 'Employee', permissions: employeeRolePermissions() });

/** A role with the whole time tracking section switched off. */
export const noRole = (name) => ({ name, permissions: { ...newRolePermissions(), time_tracking: 'nothing' } });

/** Team and costs, nothing else. */
export const costsRole = (name) => ({
  name,
  permissions: { ...none(), tasks: 'edit', 'tasks.view_all': 'edit', time_tracking: 'edit', time_tracking_team: 'edit', time_tracking_costs: 'edit' },
});
