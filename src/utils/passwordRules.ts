/**
 * The rules a new password must meet when it is set from a reset link. The
 * server enforces the same ones (api/password_reset.php); keep them in step.
 */
export const PASSWORD_MIN_LENGTH = 12;

export interface PasswordRuleState {
  /** At least PASSWORD_MIN_LENGTH characters. */
  length: boolean;
  /** An upper-case letter, a lower-case letter and a digit. */
  mix: boolean;
}

export const passwordRules = (password: string): PasswordRuleState => ({
  length: password.length >= PASSWORD_MIN_LENGTH,
  mix: /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password),
});

export const passwordMeetsRules = (password: string): boolean => {
  const rules = passwordRules(password);
  return rules.length && rules.mix;
};
