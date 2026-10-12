// Employee documents (contracts and the like) are private: the server stores them under a
// random name outside public reach and streams them through api/employee_file.php after a
// permission check. A file record's `url` therefore holds a STORAGE KEY, not a link.

export type EmployeeFileLike = { id?: string; url?: string; filePath?: string; path?: string };

const PRIVATE_KEY = /^private\/employees\/[a-f0-9]{32}\.[a-z0-9]{1,10}$/;

/** Does this record point at private storage (as opposed to a legacy public /uploads/ link)? */
export const isPrivateEmployeeFile = (file: EmployeeFileLike): boolean =>
  PRIVATE_KEY.test(String(file.url ?? file.filePath ?? file.path ?? ""));

/**
 * Where to open or download a stored document. Needs the employee the document belongs
 * to; for a record not saved yet (a form still open on a new employee) there is nothing
 * to link to, so this returns null and the caller shows the name without a link.
 */
export const employeeFileHref = (
  employeeId: string | null | undefined,
  file: EmployeeFileLike,
  options: { download?: boolean } = {}
): string | null => {
  if (!employeeId || !file.id) return null;
  if (!isPrivateEmployeeFile(file)) {
    // A legacy record the server has not migrated yet. The server never serves it from
    // here; the migration moves it on the next request, so there is nothing safe to link.
    return null;
  }
  const query = `employee=${encodeURIComponent(employeeId)}&file=${encodeURIComponent(file.id)}`;
  return `/api/employee_file.php?${query}${options.download ? "&download=1" : ""}`;
};
