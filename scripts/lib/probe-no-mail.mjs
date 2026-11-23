/**
 * Run on a probe's scratch database right after it is cloned from the dev database.
 *
 * The clone carries the dev database's live outgoing mail profiles: the system profile
 * (INTEGRATIONS_CONFIG, used for task notifications, reminders, workflows, newsletters,
 * password resets) and the support mailbox (TICKET_SETTINGS). The probes assign tasks to
 * `*@probe.test` users, so every run sent real SMTP that bounced back to the owner's inbox.
 * Blanking the hosts and Exchange credentials makes every sender see "not configured", and
 * no probe checks a real delivery. The other keys in those settings stay as they are.
 * (public/api/mail_guard.php also refuses reserved domains such as .test on the server side.)
 */
export const DISABLE_OUTBOUND_MAIL_SQL = `
  UPDATE system_settings
     SET \`value\` = JSON_SET(\`value\`, '$.smtpHost', '', '$.exchMailbox', '', '$.exchPassword', '')
   WHERE \`key\` IN ('INTEGRATIONS_CONFIG', 'TICKET_SETTINGS') AND JSON_VALID(\`value\`);
  DELETE FROM system_settings
   WHERE \`key\` IN ('INTEGRATIONS_CONFIG', 'TICKET_SETTINGS') AND NOT JSON_VALID(\`value\`);`;
