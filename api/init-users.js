import { initUserDatabase } from "./src/db/users.js";

console.log("🚀 Initializing Cobalt user database...\n");

async function initialize() {
    try {
        console.log("📦 Creating user tables...");
        await initUserDatabase();
        console.log("✅ User tables created successfully\n");
    } catch (error) {
        console.error("❌ Failed to create user tables:", error);
        process.exit(1);
    }

    console.log("✅ Initialization complete!\n");
    console.log("📝 Next steps:");
    console.log("   1. Ensure Clerk keys are configured (WEB_CLERK_PUBLISHABLE_KEY / CLERK_SECRET_KEY)");
    console.log("   2. Start the API server: pnpm start");
    console.log("   3. Start the web server: cd ../web && pnpm dev");

    process.exit(0);
}

initialize().catch((error) => {
    console.error("❌ Initialization failed:", error);
    process.exit(1);
});
