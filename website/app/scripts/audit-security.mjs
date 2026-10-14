import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

// One reviewed, time-limited CLI-only exception; every new advisory fails CI.
// See SECURITY_AUDIT.md. Do not extend this date without a new review.
const exception = 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm';
const deadline = Date.parse('2026-10-21T00:00:00Z');
const audit = spawnSync('bun', ['audit', '--json'], { encoding: 'utf8' });
if (audit.error || ![0, 1].includes(audit.status)) throw Error('Dependency audit could not run.');
let findings;
try { findings = JSON.parse(audit.stdout); } catch { throw Error('Dependency audit returned no valid report.'); }
if (!findings || typeof findings !== 'object' || Array.isArray(findings)) throw Error('Invalid dependency audit report.');
mkdirSync('.wrangler', { recursive: true });
writeFileSync('.wrangler/dependency-audit.json', JSON.stringify(findings, null, 2) + '\n');
let rejected = 0, reviewed = 0;
for (const [name, advisories] of Object.entries(findings)) {
  if (!Array.isArray(advisories)) throw Error('Invalid dependency advisory list.');
  for (const advisory of advisories) {
    if (name === 'braces' && advisory.url === exception && Date.now() < deadline) {
      console.log('Reviewed CLI-only braces advisory: no published fix; exception expires after 20 October 2026.');
      reviewed++;
    } else {
      console.error(`Unresolved dependency advisory: ${name} ${advisory.url}`);
      rejected++;
    }
  }
}
if (audit.status === 1 && rejected + reviewed === 0) throw Error('Dependency audit failed without findings.');
if (rejected) throw Error(`${rejected} unresolved or expired dependency advisories block this check.`);
console.log(`Dependency security gate passed (${reviewed} documented temporary exception).`);
