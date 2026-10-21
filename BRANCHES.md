# Branch workspaces

The app has three fixed office branches: Mussafah, Satwa, and City. These are separate from the existing party/khata list inside each register.

- **Existing data:** Mussafah retains the original `hisaab.sqlite` on desktop and MongoDB document `primary` on web. Existing entries are not copied or deleted. Satwa and City start empty.
- **Desktop:** choose a branch beside the register/journal controls. Satwa uses `hisaab-satwa.sqlite`; City uses `hisaab-city.sqlite`, in the existing app data folder. Each has independent parties, entries, numbering, cash counts, date locks, and revisions. Switching first saves the outgoing branch. Desktop data stays local and does not sync with the web app.
- **Web owner:** select **Owner — All branches** on the login screen and use the existing web password. Select any branch after login. Under **More → Branch staff logins**, set a password of at least six characters for each branch. No staff password is preset. Resetting or disabling a staff password revokes that branch's existing staff sessions.
- **Web staff:** select the branch's staff account on the login screen. Staff can access only that branch. The server enforces this for state, backups, and account settings; changing the client selector or request header cannot grant access.
- **Print:** register and Roznamcha output includes the selected branch name.
- **Backups:** backups contain the selected branch only and include its identifier. Switch to the matching branch before restoring. An older backup without a branch identifier belongs to Mussafah. Desktop automatic backup folders and optional external backup settings are independent per branch. On the web, automatic snapshots and restore safety copies are stored in MongoDB, with the latest 30 retained per branch. Export each branch separately when making a complete offline copy.

The branch API tests use in-memory database adapters and do not connect to the production database. Browser checks use `tests/branches-web.cjs`; desktop checks use `tests/branches-desktop.cjs` with a temporary user profile. These source checks do not establish that a deployed website or existing installer has been updated.
