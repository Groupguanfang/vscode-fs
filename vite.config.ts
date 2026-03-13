import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: [
    { entry: 'src/index.ts', format: ['esm', 'cjs'] },
    { entry: 'src/vscode.ts', format: ['esm', 'cjs'], deps: { neverBundle: ['vscode'] } },
  ],
})
