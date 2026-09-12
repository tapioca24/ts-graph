// Run the real built CLI in a fresh process; maxRSS includes its module loading.
await import("../dist/main.mjs");
process.stderr.write(`Peak RSS: ${process.resourceUsage().maxRSS} KiB\n`);
