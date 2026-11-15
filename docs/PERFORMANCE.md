# Performance improvements — 1.2.2

Measured on 2026-10-17 using isolated headless Edge profiles, synthetic records spread across 28 dates and 10 parties. These are single-run measurements on this machine, not guaranteed timings on every PC.

| Records | Load before / after | Input handler before / after | All-dates view before / after |
| --- | --- | --- | --- |
| 100 | 818 / 521 ms | 5–6 / 2 ms | 117 / 157 ms |
| 1,000 | 1,295 / 498 ms | 59–69 / 6–8 ms | 1,292 / 258 ms |
| 5,000 | 5,722 / 1,072 ms | 766–1,343 / 24–39 ms | 23,407 / 296 ms |

Load includes navigation and rendering. Input figures measure synchronous processing of three synthetic input events; all-dates figures include two animation frames. Small differences in short runs reflect timing noise. The all-dates screen now displays the first 200 matching records with page navigation. Totals and exports still include the full selection.

Changes:
- Duplicate lookup uses keyed maps and cached normalized fields instead of scanning every record for each visible row. Existing asymmetric no-phone/no-money matching rules and earliest-match numbering are preserved.
- Mount only the selected page, with at most 200 records plus a draft/focused row. Keep unchanged row controls and decorations intact during input.
- Page-aware serials, Tab navigation and draft placement; date/party/search changes return to the first page.
- Print/PDF temporarily materializes the complete selection and restores the screen page afterward. Print remains complete even when a pending focus event refreshes the view.
- Immediate local persistence remains enabled; edits are not postponed to obtain faster benchmark results.

Verification:
- Browser regression suite: migration, dates, filters, summary, party rename, draft/Tab, undo, backup/restore, Excel and print.
- Performance regression: pagination, full totals, duplicates across pages/dates, editing, Tab crossing a page, new drafts, full export and print, comparison against the previous duplicate scan semantics.
- Restore/history, journal and currency/security regression suites passed.
- Packaged 1.2.2 performance and restore/history checks passed with isolated profiles. Packaged smoke test confirmed visible window, input/totals, restart, native Excel download, mixed currencies and guide; no captured renderer errors.
- Actual packaged PDF contains all 450 test records across 33 pages; first, middle and final records verified by text extraction. Packaged pagination screenshot inspected.

Run `node tests/performance-benchmark.cjs` with Playwright available to repeat the benchmark. Run `node tests/performance-regression.cjs`, or set `HISAAB_TEST_PACKAGED=1` to exercise the unpacked desktop build. Evidence is under `scratch/performance-*.json`, `scratch/performance-pagination-packaged.png`, `scratch/performance-packaged.pdf`, and `scratch/electron-audit-1792233243811/`.

Limits: full printing intentionally renders all selected records and may still be slow for very large reports. Journal rendering was not redesigned. Installer installation/uninstallation and physical printing were not tested.
