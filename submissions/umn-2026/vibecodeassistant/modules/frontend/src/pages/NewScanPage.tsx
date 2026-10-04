import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../api/client'
import { PageHeader } from '../components/layout/PageHeader'
import { validateLocalTargetUrl, validateRepoPath } from '../utils/validation'

export const NewScanPage = () => {
  const navigate = useNavigate()
  const [targetUrl, setTargetUrl] = useState('http://localhost:3000')
  const [repoPath, setRepoPath] = useState('/Users/demo/projects/vibe-app')
  const [authorized, setAuthorized] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const urlError = useMemo(() => validateLocalTargetUrl(targetUrl), [targetUrl])
  const pathError = useMemo(() => validateRepoPath(repoPath), [repoPath])
  const authError = authorized ? null : 'You must confirm you own the app or are authorized to test it.'
  const isValid = !urlError && !pathError && authorized

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!isValid) {
      return
    }

    setSubmitting(true)
    const scan = await apiClient.startScan({
      target_url: targetUrl.trim(),
      repo_path: repoPath.trim(),
      authorization_confirmed: authorized,
    })
    navigate(`/scans/${scan.id}/progress`)
  }

  return (
    <div className="grid">
      <PageHeader
        title="Start a localhost scan"
        description="Enter the app URL and repository path, then confirm authorization before launching a scan."
      />

      <section className="panel">
        <form className="form-grid" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="target-url">Target URL</label>
            <input
              id="target-url"
              name="target-url"
              type="url"
              value={targetUrl}
              onChange={(event) => setTargetUrl(event.target.value)}
              aria-describedby="target-url-help target-url-error"
              aria-invalid={Boolean(urlError)}
            />
            <p id="target-url-help" className="helper">
              Accepted hosts: localhost, 127.0.0.1, or [::1], with optional ports.
            </p>
            {urlError ? (
              <p id="target-url-error" className="error-text">
                {urlError}
              </p>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="repo-path">Repository path</label>
            <input
              id="repo-path"
              name="repo-path"
              type="text"
              value={repoPath}
              onChange={(event) => setRepoPath(event.target.value)}
              aria-describedby="repo-path-help repo-path-error"
              aria-invalid={Boolean(pathError)}
            />
            <p id="repo-path-help" className="helper">
              Use a non-empty absolute path on the local filesystem.
            </p>
            {pathError ? (
              <p id="repo-path-error" className="error-text">
                {pathError}
              </p>
            ) : null}
          </div>

          <fieldset className="checkbox-field">
            <legend>Authorization</legend>
            <label htmlFor="authorization-confirmed">
              <input
                id="authorization-confirmed"
                name="authorization-confirmed"
                type="checkbox"
                checked={authorized}
                onChange={(event) => setAuthorized(event.target.checked)}
                aria-describedby="authorization-error"
              />
              <span>I own this app or am authorized to test it.</span>
            </label>
            {!authorized ? (
              <p id="authorization-error" className="error-text">
                {authError}
              </p>
            ) : null}
          </fieldset>

          <div className="button-row">
            <button className="button" type="submit" disabled={!isValid || submitting}>
              {submitting ? 'Starting scan…' : 'Start scan'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
