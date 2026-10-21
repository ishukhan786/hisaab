# Branch workspaces

Fixed office branches (Mussafah, Satwa, and City) are integrated for the **Web app**. The **Electron desktop app** runs as a standalone single-workspace offline application using `hisaab.sqlite` without branch switching.

- **Existing data:** Mussafah retains the original MongoDB document `primary` on web. Desktop continues using its local `hisaab.sqlite`.
- **Desktop:** Operates independently as a single-branch offline register. Branch switching controls and multiple SQLite branch files are disabled on the desktop app. All data stays local in `hisaab.sqlite`.
- **Web owner:** sign in with the owner's Clerk username and password. Under **More → Branches & users**, add branches, create individual user accounts, and assign or disable branch access. Passwords require at least eight characters. Web PIN login, public sign-up and the main branch-switching dropdown are disabled. See `CLERK_SETUP.md` for deployment configuration.
- **Web staff:** sign in with an individual username and password. The assigned branch opens automatically. Staff can access only that branch. The server enforces assignments on state and backups; changing request headers cannot grant access. Disabling an explicit assignment blocks existing sessions on their next protected request.
- **Print:** register and Roznamcha output includes the selected branch name on web.
- **Backups:** Web backups contain the selected branch only and include its identifier. Desktop backups remain unified for the single local workspace.

The branch API tests use in-memory database adapters and do not connect to the production database. Browser checks use `tests/branches-web.cjs`.
