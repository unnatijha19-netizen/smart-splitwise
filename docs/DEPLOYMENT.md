# Deployment checklist

This project is prepared for local development. Before deploying:

1. Provision a managed PostgreSQL database.
2. Set `DATABASE_URL` and `PORT` as environment variables in the hosting platform.
3. Run Prisma migrations as a release step: `npx prisma migrate deploy`.
4. Build the API: `npm run build` inside `apps/api`.
5. Build the frontend: `npm run build` inside `apps/web`.
6. Configure the frontend host to proxy `/api` to the API, or set up a Vite/API reverse proxy on one origin.
7. Enable HTTPS and configure CORS to allow only the frontend origin.
8. Add authentication and group-scoped authorization before storing personal or company data.
9. Configure monitoring, logs, backups, and secret management.
10. Never commit `.env` or production credentials.

This is a deployment guide, not a claim that the application has already been deployed.
