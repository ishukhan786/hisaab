# Clerk development setup

This project uses Express with plain browser JavaScript and Electron. Do not scaffold a Next.js replacement. Use the existing Clerk application `app_3KpxdWkU85dMwKww00El065NiCS`.

## Running this machine's development setup

Run `cmd /c npm run serve:clerk`, then open http://localhost:3000/. The user-created `admin` account has owner access and belongs to Mussafah Branch, Satwa Branch, and City Branch. The gitignored `.clerk/owner.json` and `.clerk/branches.json` hold the local non-secret identity/organization mappings. Keys were pulled by the Clerk CLI into the gitignored `.env`; do not print or commit it.

The development Clerk instance uses username + password and restricted sign-up. The login page never offers sign-up. The owner opens **More → Branches & users** to add office branches, create individual Clerk usernames/passwords, and assign, reassign or disable branch access. Passwords go directly through the server to Clerk and are not stored in accounting settings. Every user has a separate Clerk user ID; multiple staff may share one branch, with one branch per staff account. No real staff test account was created during implementation.

Branch definitions and explicit assignments live in the MongoDB AppSetting `branch_access_v1`, with compare-and-swap revisions to prevent conflicting admin edits. Explicit disabled assignments override existing organization memberships. Assignments are checked on every protected request, so disabling or reassigning a user affects existing session tokens immediately. Existing organization-based access remains compatible for users without an explicit app assignment; save an explicit assignment to manage those users here. Clerk's forced organization selection is disabled because app assignments handle branch selection. Existing organizations remain intact.

## Authentication migration

- The existing app has a shared owner PIN and shared branch staff passwords, rather than individual user records. Do not import those shared passwords as individual Clerk identities.
- The custom Node scrypt password format is not a compatible Clerk password digest. Users set their own new Clerk credentials. Never upload plain-text PINs or invent replacement passwords.
- Data remains in the existing MongoDB documents: `primary` for Mussafah, `branch:satwa`, and `branch:city`. Clerk manages identity, not accounting records. Electron continues to use local SQLite and its existing PIN.
- Web authentication always uses Clerk. Missing Clerk configuration fails closed; it never falls back to PIN login. Legacy PIN routes are disabled. Only isolated tests can select the legacy provider using both `NODE_ENV=test` and `HISAAB_AUTH_PROVIDER=pin`.
- These changes are local and not deployed. Configure keys, allowed production origins and owner IDs before publishing. Existing deployed code is unchanged until a deployment is authorized.

## Configuration

Authenticate the CLI yourself in the host terminal: `npx -y clerk@latest auth login`. Then initialize/link the existing application according to the official CLI setup. Do not create an accountless replacement. Do not print environment files or keys.

Required server environment values:

| Variable | Meaning |
| --- | --- |
| `HISAAB_AUTH_PROVIDER` | Optional; Clerk is always used by the web app outside isolated legacy tests. |
| `CLERK_PUBLISHABLE_KEY` | The existing application's development publishable key. |
| `CLERK_SECRET_KEY` or `CLERK_JWT_KEY` | Server-only verification material; the latter is the Clerk public PEM key. |
| `CLERK_AUTHORIZED_PARTIES` | Exact allowed browser origins, comma-separated; defaults to localhost and 127.0.0.1 on port 3000. |
| `CLERK_OWNER_USER_IDS` | Explicit comma-separated owner user IDs. An empty list grants nobody owner access. |
| `CLERK_ORG_MUSSAFAH` | Organization ID for Mussafah Branch. |
| `CLERK_ORG_SATWA` | Organization ID for Satwa Branch. |
| `CLERK_ORG_CITY` | Organization ID for City Branch. |
| `CLERK_ALLOW_DEVELOPMENT_SIGNUP` | Ignored. Sign-up is never offered by this app. |

Keep username + password sign-in and restricted sign-up in Clerk. Create staff in the owner panel and assign a branch. Client-provided roles never grant ownership. Existing organization admins remain branch staff unless their user ID is explicitly on the owner allowlist.

The browser gets a fresh Clerk session token for every accounting request. The server checks its signature, expiry, issuer, allowed origin, and branch assignment. A verified identity without an approved branch or owner assignment cannot read accounting state. Explicit app assignment changes take effect on the next request; legacy organization membership changes take effect when Clerk refreshes the token. Passwords stay with Clerk.

Clerk production requires a domain you own and control DNS for. `hisaabwebapp.vercel.app` can be used for development testing, not a production Clerk instance. See https://clerk.com/docs/guides/development/deployment/vercel.
