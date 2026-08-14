import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const workflowPath = resolve(
  process.cwd(),
  '../.github/workflows/build-pl-model-react.yml',
)

describe('GitHub Actions build workflow', () => {
  it('builds the nested React project and uploads its distribution', () => {
    expect(existsSync(workflowPath)).toBe(true)

    const workflow = readFileSync(workflowPath, 'utf8')

    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toContain('working-directory: pl-model-react')
    expect(workflow).toContain('cache-dependency-path: pl-model-react/package-lock.json')
    expect(workflow).toContain('run: npm ci --include=optional')
    expect(workflow).toContain('run: npm test')
    expect(workflow).toContain('run: npm run build')
    expect(workflow).toMatch(/uses: actions\/upload-artifact@v\d+/)
    expect(workflow).toContain('path: pl-model-react/dist/')
    expect(workflow).toContain('if-no-files-found: error')
  })
})
