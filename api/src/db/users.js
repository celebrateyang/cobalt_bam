import { query, initPool } from "./pg-client.js";
import { env } from "../config.js";

export const initUserDatabase = async () => {
    if (env.dbType && env.dbType !== "postgresql") {
        throw new Error(
            `User database requires PostgreSQL (DB_TYPE=postgresql). Received DB_TYPE=${env.dbType}`,
        );
    }

    initPool();

    // Core users table (Clerk is the source of truth for authentication)
    await query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            clerk_user_id TEXT NOT NULL UNIQUE,
            primary_email TEXT,
            full_name TEXT,
            avatar_url TEXT,
            last_seen_at BIGINT,
            is_disabled BOOLEAN DEFAULT false,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
        );
    `);

    await query(
        `CREATE INDEX IF NOT EXISTS idx_users_clerk_user_id ON users(clerk_user_id);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_users_primary_email ON users(primary_email);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_users_last_seen_at ON users(last_seen_at DESC);`,
    );

    // Roles (RBAC) - optional, for future admin / internal permissions
    await query(`
        CREATE TABLE IF NOT EXISTS roles (
            key TEXT PRIMARY KEY,
            description TEXT
        );
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS user_roles (
            user_id INTEGER NOT NULL,
            role_key TEXT NOT NULL,
            created_at BIGINT NOT NULL,
            PRIMARY KEY (user_id, role_key),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (role_key) REFERENCES roles(key) ON DELETE CASCADE
        );
    `);

    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);`,
    );

    // Entitlements (feature flags) used for gating features like batch download
    await query(`
        CREATE TABLE IF NOT EXISTS entitlements (
            key TEXT PRIMARY KEY,
            description TEXT
        );
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS user_entitlements (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            entitlement_key TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'manual', -- manual | subscription | webhook | admin
            granted_at BIGINT NOT NULL,
            expires_at BIGINT,
            revoked_at BIGINT,
            metadata JSONB,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (entitlement_key) REFERENCES entitlements(key) ON DELETE CASCADE
        );
    `);

    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_entitlements_user_id ON user_entitlements(user_id);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_entitlements_key ON user_entitlements(entitlement_key);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_user_entitlements_active ON user_entitlements(user_id, entitlement_key, expires_at, revoked_at);`,
    );

    // Plans + subscriptions (future billing integration). A plan grants entitlements.
    await query(`
        CREATE TABLE IF NOT EXISTS plans (
            id SERIAL PRIMARY KEY,
            key TEXT NOT NULL UNIQUE, -- e.g. free | pro | enterprise
            name TEXT NOT NULL,
            description TEXT,
            is_active BOOLEAN DEFAULT true,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
        );
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS plan_entitlements (
            plan_id INTEGER NOT NULL,
            entitlement_key TEXT NOT NULL,
            PRIMARY KEY (plan_id, entitlement_key),
            FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
            FOREIGN KEY (entitlement_key) REFERENCES entitlements(key) ON DELETE CASCADE
        );
    `);

    await query(
        `CREATE INDEX IF NOT EXISTS idx_plan_entitlements_plan_id ON plan_entitlements(plan_id);`,
    );

    await query(`
        CREATE TABLE IF NOT EXISTS subscriptions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            plan_id INTEGER,
            provider TEXT NOT NULL DEFAULT 'clerk', -- clerk | stripe | manual
            provider_customer_id TEXT,
            provider_subscription_id TEXT,
            status TEXT NOT NULL, -- active | trialing | past_due | canceled | incomplete | unpaid
            current_period_start BIGINT,
            current_period_end BIGINT,
            cancel_at_period_end BOOLEAN DEFAULT false,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL,
            UNIQUE (provider, provider_subscription_id)
        );
    `);

    await query(
        `CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);`,
    );
    await query(
        `CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);`,
    );

    // Seed: core entitlement for future gating
    await query(
        `INSERT INTO entitlements (key, description)
         VALUES ('batch_download', 'Allows using the batch download feature')
         ON CONFLICT (key) DO NOTHING;`,
    );

    console.log("✅ User database initialized");
};

export const upsertUserFromClerk = async ({
    clerkUserId,
    primaryEmail,
    fullName,
    avatarUrl,
}) => {
    const now = Date.now();

    const result = await query(
        `
        INSERT INTO users (
            clerk_user_id,
            primary_email,
            full_name,
            avatar_url,
            last_seen_at,
            created_at,
            updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (clerk_user_id) DO UPDATE
            SET primary_email = EXCLUDED.primary_email,
                full_name = EXCLUDED.full_name,
                avatar_url = EXCLUDED.avatar_url,
                last_seen_at = EXCLUDED.last_seen_at,
                updated_at = EXCLUDED.updated_at
        RETURNING *
        `,
        [
            clerkUserId,
            primaryEmail || null,
            fullName || null,
            avatarUrl || null,
            now,
            now,
            now,
        ],
    );

    return result.rows[0];
};

export const getUserByClerkId = async (clerkUserId) => {
    const result = await query(`SELECT * FROM users WHERE clerk_user_id = $1`, [
        clerkUserId,
    ]);
    return result.rows[0] || null;
};

