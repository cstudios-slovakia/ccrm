# Long-term Development Context Management

This skill ensures that as a project evolves over many sessions, the agent maintains a clear, up-to-date understanding of the architecture, security models, and workflows without needing to re-scan every file.

## 1. The Context File (`AGENT_CONTEXT.md`)
Every complex project should have an `AGENT_CONTEXT.md` file in the root directory. This file is excluded from Git but serves as the primary source of truth for the AI assistant.

### MANDATORY SESSION START
At the beginning of every new session or when entering an existing project:
1.  **Search** for `AGENT_CONTEXT.md` in the root.
2.  **Read** its content entirely before proposing any architectural changes or debugging complex issues.
3.  Use this context to ensure new code respects existing user roles, database schemas, and API pathing rules.

## 2. Continuous Documentation (Updating the Context)
The `AGENT_CONTEXT.md` is a living document. You **MUST** update it whenever:
*   **New Features are added**: Document the purpose and the logic flow.
*   **Schema changes**: Update the database section with new tables or columns.
*   **Security updates**: Document changes to authentication or role-based access.
*   **New Gotchas**: If you solve a tricky deployment or environment bug, document it immediately so it isn't repeated.
*   **Configuration changes**: If new environment variables or config files are introduced.

## 3. Development Philosophy
*   **Premium Aesthetics**: Always prioritize a "WOW" factor. Use gradients, glassmorphism, and smooth transitions.
*   **Role Integrity**: Never bypass role-based checks. Ensure Cleaners stay in their simplified view and Admins maintain global control.
*   **PWA Stability**: Ensure manifest files, service workers, and icons are correctly linked after every deployment.
*   **No Placeholders**: Never leave `TODO` or placeholder logic. If a feature is requested, build it fully or document why it's pending in the context file.

## 4. How to Update
When a task is completed, take a moment to review if the project state has changed. Use the `replace_file_content` or `write_to_file` tools to keep the `AGENT_CONTEXT.md` accurate. Failure to keep this file updated will result in "context rot" and future errors.
