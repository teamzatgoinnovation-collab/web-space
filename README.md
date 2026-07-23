# ZatGo Space (web)

**Package:** `@zatgo/space-web`  
**Port:** 3010  
**Role:** Public self-serve wizard to create ERPNext sites as `{slug}.zatgo.online` on the DigitalOcean Docker bench.

## Run

```bash
pnpm install
cp Clients/web/space-web/.env.example Clients/web/space-web/.env.local
# edit DO_SSH_*, DO_DB_ROOT_PASSWORD, FRAPPE_*
pnpm --filter @zatgo/space-web dev
```

Open http://localhost:3010

## DNS (one-time, Namecheap)

| Type | Host | Value |
|------|------|-------|
| A | `*` | `157.230.8.164` |
| A | `space` | `157.230.8.164` |

Namecheap API is not required for MVP (wildcard covers all slugs).

## Env

See `.env.example`.
