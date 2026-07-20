import { defineConfig } from "drizzle-kit";
import { databaseConfig } from "./src/configs/env";



export default defineConfig({
  out: "./drizzle", 
  schema: [
    "./src/models.ts"
  ],
  dialect: "postgresql",
  dbCredentials: {
    url: databaseConfig.dbUrl!,
   
  },
  verbose: true,
  strict: true,
});