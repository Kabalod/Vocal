#!/usr/bin/env node
process.argv.push("--auth");
require("./test-postgres.cjs");
