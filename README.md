# ZatGo Space (web)

**Package:** `@zatgo/space-web`  
**Port:** 3010  
**Role:** Self-serve wizard to create ERPNext sites as `{slug}.zatgo.online` on the **shared Docker bench**.

## Architecture (Docker-first)

```
Docker bench (frappe_docker-backend-1)
├── erp.zatgo.online      ← one site (ERP), not the Space control plane
├── {slug}.zatgo.online   ← Space-created customer sites
└── apps/                 ← get-app packages (wizard Apps list)
```

space-web connects to the **bench via SSH**, not to `erp.zatgo.online` APIs.

| Concern | Source |
|---------|--------|
| Plans / pool / Space Orders | `data/control/store.json` (space-web) |
| Installable apps | Docker `apps/` (`ls apps` via SSH) |
| Sites dashboard | Docker `sites/` + Space Orders (erp shown, **not** in Space pool) |
| Provisioning | SSH → `bench new-site` / `install-app` |
| Optional Frappe dual-write | `SPACE_FRAPPE_SYNC=1` only (legacy) |

## Run

```bash
pnpm install
cp Clients/web/space-web/.env.example Clients/web/space-web/.env.local
# edit DO_SSH_* and DO_DB_ROOT_PASSWORD
pnpm --filter @zatgo/space-web dev
```

Open http://localhost:3010 · Sites dashboard: http://localhost:3010/sites

## DNS (one-time, Namecheap)

| Type | Host | Value |
|------|------|-------|
| A | `*` | `157.230.8.164` |
| A | `space` | `157.230.8.164` |

Namecheap API is not required for MVP (wildcard covers all slugs).

## Env

See `.env.example`.
