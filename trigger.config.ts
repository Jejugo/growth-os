import { defineConfig } from '@trigger.dev/sdk'

export default defineConfig({
  // Preencha com o ID do projeto após `npx trigger.dev@latest init`.
  project: process.env.TRIGGER_PROJECT_REF ?? 'proj_growthos',
  dirs: ['./src/trigger'],
  runtime: 'node',
  maxDuration: 600,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 5_000,
      maxTimeoutInMs: 60_000,
      randomize: true,
    },
  },
})
