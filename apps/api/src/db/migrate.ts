import { loadConfig } from "../config";
import { createDb } from "./client";

const config = loadConfig();
createDb(config.databasePath);
console.log(`✔ Migrations applied to ${config.databasePath}`);
