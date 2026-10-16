# Hisaab Desktop 1.0.1 — Verification

All four findings from the 1.0.0 audit are fixed:
- PKR and AFN now have separate totals in the register, daily summary, print, and Excel. Mixed-currency Excel exports have separate columns. Existing populated party currencies cannot be silently relabeled.
- Party names are inserted as text, not HTML. CSP and Electron navigation restrictions added. Harmless stored-script marker no longer executes in the packaged app.
- Explicit ASCII installer filename matches latest.yml. SHA-512 verified against Hisaab-Setup-1.0.1.exe.
- Help opens the included guide.html inside a separate Electron window. Packaged window verified.

Additional fixes: changing the working date updates only blank drafts; historical records retain their dates. Mobile header overflow fixed. Regression harness updated for the current More menu and party tabs.

Passed:
- tests/browser-check.cjs: migration, dates, summary, search, parties, Tab/draft, Undo, backup/restore, Excel, print PDF and responsive layout.
- tests/currency-security.cjs: PKR/AFN separation, historical currency protection, unchanged-name rename and hostile party-name text.
- tests/electron-release.cjs: visible packaged 1.0.1 launch with isolated userData, input and totals, real button interactions, reopen persistence, native Excel download, separated totals/summary/print representation, blocked party HTML and Help window.
- Independent Excel reader verified separate PKR=100 / AFN=200 totals from the actual packaged download.
- Rendered mixed-currency PDF inspected.
- Final app.asar contents match source, including guide.html.
- Installer and portable build exited successfully. Installer metadata filename and SHA-512 match.

Artifacts:
- dist/Hisaab-Setup-1.0.1.exe — 82,716,150 bytes
- dist/Hisaab-Portable-1.0.1.exe — 82,509,039 bytes

Limits: installer installation/uninstallation, portable launcher extraction, physical printer and automatic backup file picker were not tested. Automated native shortcut delivery was inconsistent; dialogs were verified by real clicks. No claim of physical print or full OS installation acceptance is made.

Evidence: scratch/electron-audit-1792105277988/ and scratch/mixed-preview.png. No real user data was edited. This report supersedes the 1.0.0 findings in scratch/READINESS-AUDIT.md.
