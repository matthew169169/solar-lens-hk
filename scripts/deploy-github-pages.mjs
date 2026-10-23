import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Publish compiled assets, not private source history. No GitHub Actions workflow
// permission is required: GitHub's built-in branch deployment handles Pages.
const config = JSON.parse(readFileSync('github-pages.json', 'utf8'));
const repository = process.argv[2] || config.repository;
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Expected owner/repository.');
if (!existsSync('dist/index.html')) throw new Error('Run npm run build before deployment.');
const run = (command, args, cwd = process.cwd(), allowFailure = false, input) => {
  const r = spawnSync(command, args, { cwd, encoding: 'utf8', input, maxBuffer: 20 * 1024 * 1024 });
  if (!allowFailure && r.status !== 0) throw new Error((r.stderr || r.stdout || r.error?.message || `${command} failed`).trim());
  return r;
};
const remote = `https://github.com/${repository}.git`;
const ref = config.branch || 'gh-pages';
if (!/^[a-zA-Z0-9_-]+$/.test(ref)) throw new Error('Invalid publishing branch.');
const temporary = mkdtempSync(path.join(tmpdir(), 'solar-github-pages-'));
const git = (args, cwd = temporary, allowFailure = false) => run('git', ['-c', 'credential.helper=!gh auth git-credential', ...args], cwd, allowFailure);
const current = git(['ls-remote', '--heads', remote, `refs/heads/${ref}`], process.cwd());
try {
  if (current.stdout.trim()) {
    git(['clone', '--depth', '1', '--single-branch', '--branch', ref, remote, '.']);
  } else {
    git(['init', '--initial-branch', ref, '.']);
    git(['remote', 'add', 'origin', remote]);
  }
  for (const name of readdirSync(temporary)) if (name !== '.git') rmSync(path.join(temporary, name), { recursive: true, force: true });
  // Keep corresponding application source with the deployment. Exclude the
  // private hosting identity and research archive; approved app demo assets stay.
  const tracked = run('git', ['ls-files', '-z']).stdout.split('\0').filter(Boolean);
  for (const file of tracked) {
    if (file.startsWith('research/') || file.startsWith('.openai/') || file.startsWith('.github/')) continue;
    cpSync(path.resolve(file), path.join(temporary, file), { recursive: true });
  }
  cpSync(path.resolve('dist'), path.join(temporary, 'docs'), { recursive: true });
  writeFileSync(path.join(temporary, 'docs/.nojekyll'), '');
  const sha = run('git', ['rev-parse', 'HEAD']).stdout.trim();
  writeFileSync(path.join(temporary, 'docs/deployment.json'), JSON.stringify({ repository, source_commit: sha, generated_at: new Date().toISOString() }, null, 2));
  run('tar', ['-czf', 'docs/source.tar.gz', '--exclude=./.git', '--exclude=./docs', '.'], temporary);
  git(['add', '--all']);
  const changes = git(['diff', '--cached', '--quiet'], temporary, true);
  if (changes.status !== 0) git(['-c', 'user.name=Solar Lens Deploy', '-c', 'user.email=solar-lens@users.noreply.github.com', 'commit', '-m', `Deploy Solar Lens from ${sha.slice(0, 7)}`]);
  git(['push', 'origin', `${ref}:${ref}`]);
  const publishingCommit = git(['rev-parse', 'HEAD']).stdout.trim();
  const endpoint = `repos/${repository}/pages`;
  const before = run('gh', ['api', endpoint], process.cwd(), true);
  const body = JSON.stringify({ build_type: 'legacy', source: { branch: ref, path: '/docs' } });
  let result = before;
  if (before.status !== 0 && /404|Not Found/.test(before.stderr + before.stdout)) {
    const created = run('gh', ['api', '--method', 'POST', endpoint, '--input', '-'], process.cwd(), true, body);
    // A concurrent UI setup or propagation delay can make GET return 404 just
    // before POST returns 409. Reuse the existing site; never duplicate it.
    if (created.status !== 0 && !/409|already enabled/.test(created.stderr + created.stdout)) throw new Error(created.stderr || 'Could not enable Pages.');
    result = run('gh', ['api', endpoint]);
  } else if (before.status !== 0) {
    throw new Error(before.stderr || 'Could not inspect Pages settings.');
  }
  const existing = JSON.parse(result.stdout);
  if (existing.source?.branch !== ref || existing.source?.path !== '/docs' || existing.build_type !== 'legacy') {
    run('gh', ['api', '--method', 'PUT', endpoint, '--input', '-'], process.cwd(), false, body);
    result = run('gh', ['api', endpoint]);
  }
  const site = JSON.parse(result.stdout);
  // A successful push or an old "built" site status is not confirmation that
  // this release is live. Wait for this branch commit and its public manifest.
  const deadline = Date.now() + 10 * 60 * 1000;
  let live = false, lastStatus = '';
  while (Date.now() < deadline) {
    const buildResult = run('gh', ['api', `${endpoint}/builds/latest`], process.cwd(), true);
    if (buildResult.status === 0) {
      const build = JSON.parse(buildResult.stdout);
      if (build.commit === publishingCommit && build.status === 'errored') throw new Error(build.error?.message || 'GitHub Pages build failed.');
      if (build.commit === publishingCommit && build.status === 'built') {
        const verification = new URL('deployment.json', site.html_url);
        verification.searchParams.set('release', publishingCommit);
        try {
          const response = await fetch(verification, { signal: AbortSignal.timeout(15000) });
          if (response.ok && (await response.json()).source_commit === sha) { live = true; break; }
        } catch { /* Allow the public CDN to catch up with the completed build. */ }
      }
      const message = build.commit === publishingCommit ? build.status : 'queued';
      if (message !== lastStatus) { console.log(`GitHub Pages: ${message}`); lastStatus = message; }
    }
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  if (!live) throw new Error('Deployment was pushed, but GitHub Pages did not confirm this release within ten minutes. Inspect the existing build before retrying.');
  console.log(JSON.stringify({ repository, source_commit: sha, publishing_commit: publishingCommit, branch: ref, status: 'built', url: site.html_url, public: site.public }));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
