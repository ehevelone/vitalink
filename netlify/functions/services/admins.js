async function ensureAdminsTable(poolOrClient) {
  await poolOrClient.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS admins (
      id uuid primary key default gen_random_uuid(),
      email text not null unique,
      name text,
      phone text,
      password_hash text,
      active boolean not null default true,
      full_access boolean not null default true,
      role text not null default 'admin',
      admin_session_token text,
      admin_session_expires timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    ALTER TABLE admins
    ADD COLUMN IF NOT EXISTS name text,
    ADD COLUMN IF NOT EXISTS phone text,
    ADD COLUMN IF NOT EXISTS password_hash text,
    ADD COLUMN IF NOT EXISTS active boolean not null default true,
    ADD COLUMN IF NOT EXISTS full_access boolean not null default true,
    ADD COLUMN IF NOT EXISTS role text not null default 'admin',
    ADD COLUMN IF NOT EXISTS admin_session_token text,
    ADD COLUMN IF NOT EXISTS admin_session_expires timestamptz,
    ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now(),
    ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
  `);
}

async function findAdminByEmail(poolOrClient, email) {
  await ensureAdminsTable(poolOrClient);

  const result = await poolOrClient.query(
    `
    SELECT id, email, name, phone, password_hash, active, full_access, role
    FROM admins
    WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))
    LIMIT 1
    `,
    [email]
  );

  return result.rows[0] || null;
}

async function findAdminBySession(poolOrClient, token) {
  await ensureAdminsTable(poolOrClient);

  const result = await poolOrClient.query(
    `
    SELECT id, email, name, role, active, full_access, admin_session_expires
    FROM admins
    WHERE admin_session_token = $1
    LIMIT 1
    `,
    [token]
  );

  const admin = result.rows[0];

  if (!admin) {
    return null;
  }

  if (admin.active !== true || admin.full_access !== true) {
    return null;
  }

  if (!admin.admin_session_expires || new Date(admin.admin_session_expires) < new Date()) {
    return null;
  }

  return {
    ...admin,
    role: "admin",
    source: "admins"
  };
}

module.exports = {
  ensureAdminsTable,
  findAdminByEmail,
  findAdminBySession
};
