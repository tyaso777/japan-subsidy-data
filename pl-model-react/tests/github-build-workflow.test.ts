// @vitest-environment node
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

  it('packages a public download and publishes it as the latest GitHub Release', () => {
    expect(existsSync(workflowPath)).toBe(true)

    const workflow = readFileSync(workflowPath, 'utf8')

    expect(workflow).toContain('release:')
    expect(workflow).toContain('needs: build')
    expect(workflow).toMatch(/release:[\s\S]+permissions:\s+contents: write/)
    expect(workflow).toMatch(/uses: actions\/download-artifact@v\d+/)
    expect(workflow).toContain(
      'cd release-assets && zip -r ../pl-model-react-dist.zip .',
    )
    expect(workflow).not.toContain('zip -j')
    expect(workflow).toContain('GH_TOKEN: ${{ github.token }}')
    expect(workflow).toContain('GH_REPO: ${{ github.repository }}')
    expect(workflow).toContain('tag="pl-model-react-${short_sha}"')
    expect(workflow).toContain('gh release create "$tag" pl-model-react-dist.zip')
    expect(workflow).toContain('gh release upload "$tag" pl-model-react-dist.zip --clobber')
    expect(workflow).toContain('--latest')
  })
})
