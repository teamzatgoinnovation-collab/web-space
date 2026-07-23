# ZatGo Space (web)

**Package:** `@zatgo/space-web`  
**Port:** 3010  
**Role:** Public self-serve wizard to create ERPNext sites as `{slug}.zatgo.online` on the DigitalOcean Docker bench.

## Control plane

Orders, plans, and soft quotas live in **space-web** (`data/control/store.json`).  
**`erp.zatgo.online` is not required.**

| Concern | Source |
|---------|--------|
| Plans / pool / Space Orders | `data/control/store.json` |
| Installable apps | Docker bench (`ls apps` via SSH) |
| Provisioning | SSH → `bench new-site` / `install-app` |
| Optional Frappe dual-write | `SPACE_FRAPPE_SYNC=1` only |

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
