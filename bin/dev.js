#!/usr/bin/env -S node --enable-source-maps node_modules/.bin/tsx

import { execute } from "@oclif/core";

await execute({ development: true, dir: import.meta.url });
