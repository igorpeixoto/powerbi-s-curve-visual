import { defineConfig } from "vitest/config";

// Date tests must run in a zone that observes DST (SPEC §12). CI runs in UTC and the development
// machine's zone has no DST, so pin one here; worker processes inherit it from this process.
process.env.TZ = "Europe/Berlin";

export default defineConfig({
    test: {
        include: ["src/**/__tests__/**/*.test.ts"],
        environment: "node",
    },
});
