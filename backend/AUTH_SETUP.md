# Enabling MediRoute sign-in

The role dashboards require the additive account migration and a signing secret. The workspace `.env` now has a generated signing secret. Keep the existing database and its records; the migration adds the `accounts` table and nullable ownership/doctor fields to emergencies.

From the `backend` directory in PowerShell:

1. For another installation, set a unique random `AUTH_SECRET_KEY` (at least 32 random characters) and the correct frontend origins in `.env`. Do not use the example secret in production.
2. Apply the schema update: `venv\Scripts\alembic.exe upgrade head` (the current local database is already migrated).
3. Create the first administrator interactively: `venv\Scripts\python.exe create_admin.py`
4. Start the API from `backend` so it loads `.env`: `venv\Scripts\uvicorn.exe app.main:app --reload`. Start the frontend with `cd ..\frontend; npm run dev`. Requester accounts can register at `/register`; Admin provisions hospital logins from **Hospitals & access**.

The migration was verified against a disposable SQLite database and applied to the configured local SQLite database. The application records were not reset or deleted.
