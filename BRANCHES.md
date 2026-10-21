# Single Unified Workspace (No Branches, No Login Barrier)

Hisaab operates as a unified single-workspace register across both the **Web App** and the **Electron Desktop App**. Multi-branch office segregation and web login authentication barriers have been completely removed.

- **Direct Instant Access:** Both web and desktop apps open directly into the daily register without any login or authentication barrier.
- **Unified MongoDB Atlas Storage (Web):** The web app synchronizes with MongoDB Atlas using the `primary` document key, preserving all existing Mussafah data, journal records, cash summaries, and revisions without data loss.
- **Unified SQLite Storage (Desktop):** The desktop app operates completely offline using `hisaab.sqlite`.
- **Optional In-App PIN Lock:** Users can optionally set a local screen lock PIN in Settings. This functions purely as a client-side screen lock and never blocks data persistence or server APIs.
- **External & JSON Backups:** External snapshots and JSON backups are stored directly under the unified backup directory without branch subfolders.
