# Jawda Board

Company-wide project + kanban board. Static site on GitHub Pages, data in Supabase, one shared team password.

```
index.html            the whole app (projects view, kanban, task drawer, filters, export)
config.js             your Supabase URL / key / login email  ← the only file you edit
supabase/schema.sql   database tables, automation trigger, security, team seed
```

## Setup (≈15 minutes, once)

### 1. Create the Supabase project
1. Go to supabase.com → **New project**. Name it `jawda-board`, region **West EU (London)**, pick any strong database password (you won't need it day to day).
2. Wait for it to provision, then open **SQL Editor → New query**, paste the whole of `supabase/schema.sql`, press **Run**. You should see "Success".

### 2. Create the shared login
1. **Authentication → Users → Add user → Create new user**.
2. Email: `admin@jawda.co.uk` (or whatever you like — must match `LOGIN_EMAIL` in `config.js`).
3. Password: the team password everyone will type on the login screen. Tick **Auto confirm user**.
4. **Authentication → Providers → Email**: turn **off** "Allow new users to sign up" so nobody can create a second account.

To change the team password later: Authentication → Users → the user → Reset password.

### 3. Fill in config.js
Open `config.js` in a text editor — on Windows, **right-click → Open with → Notepad** (double-clicking runs it as a script and shows a "Windows Script Host" error; the file is fine, just don't double-click it).

**Project Settings → API**: copy **Project URL** and the **anon public** key into `config.js`. The anon key is designed to be public; nothing is readable without the password because of the row-level-security policy in the schema.

### 4. Host on GitHub
1. New repo (e.g. `jawda-board`), upload `index.html`, `config.js`, `README.md`, and the `supabase/` folder.
2. **Settings → Pages → Source: Deploy from a branch → main / root → Save**.
3. Share the Pages URL and the team password with the team.

## Using it

- **You are** (top bar): pick yourself once per device. It drives "My tasks", default assignee on new tasks, and the activity log.
- **Projects view**: grouped 00–17. Click a project to expand its tasks; type in "Add a task" and press Enter for quick entry; change status inline from the dropdown; hover a project and click **Edit** for owner, group, status, quarter, goal.
- **Project status** is automatic — **Not started** (every task is To do), **In progress**, **Done** (every task is Done) — unless you set it by hand to **On hold** or **Closed**. Closed projects are hidden from both views while the **Hide closed** chip is on.
- **Kanban**: To do → In progress → Awaiting approval → Done, plus **Stuck** for blocked tasks. Drag cards between columns on desktop; on mobile open the card and change the status.
- **Dates**: Start fills in automatically when a task leaves To do and clears if it goes back; End fills in when it reaches Done (and clears if it's moved back); Due is set by hand. Overdue due dates turn red, due-within-3-days amber.
- **Filters**: search, person, group, project, My tasks, Overdue, Hide closed. Count on the right shows how many match.
- **⋯ menu**: Refresh, Export tasks to CSV, Download backup (JSON), Sign out.
- **Keyboard**: `n` new task · `/` search · `1` projects · `2` kanban · `Esc` close.

## Updating an existing install
If the database was created before 20 Oct 2026, run `supabase/migration-2026-10-20.sql` once in the SQL Editor (adds Stuck, Closed, and the start-date reset). Fresh installs get all of this from `schema.sql`.

## Team roster
The 12 Slack members are seeded in `people`. To add or remove someone: Supabase → **Table Editor → people** (set `active` to false rather than deleting, so their history stays attached). Colours are hex values from the brand palette.

## Changing groups or statuses
Groups (names + colours) are the `GROUPS` list at the top of the `<script>` in `index.html`. Statuses are in `STATUSES` there **and** in the `check` constraint on `tasks.status` in the schema — change both.
