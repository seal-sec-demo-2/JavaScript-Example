# Seal Security — JavaScript (npm) Example

A minimal, intentionally vulnerable Node.js/Express application used to demonstrate,
end‑to‑end, how [Seal Security](https://www.sealsecurity.io/) remediates a known CVE by
replacing a vulnerable dependency with a **sealed** (backported, drop‑in) version — with
**no change to your declared version ranges or your code**.

It is designed as a front‑to‑back smoke test for the Seal CLI in CI/CD: run the app, trigger
a real exploit, run Seal, and watch the same exploit get blocked.

---

## What this example demonstrates

| | |
|---|---|
| **Ecosystem** | JavaScript / npm |
| **Vulnerable package** | `ejs@2.7.0` (resolves to 2.7.4) |
| **CVE** | [CVE‑2022‑29078](https://nvd.nist.gov/vuln/detail/CVE-2022-29078) — EJS server‑side template injection → Remote Code Execution (CVSS 9.8) |
| **Sealed (fixed) version** | `ejs 2.7.4-sp1` from Seal's npm registry |
| **Integration** | Seal CLI as one build step — shown for both **GitHub Actions** and **Jenkins** |

The app also ships other well‑known vulnerable dependencies (`lodash 4.17.5`, `json5 0.5.1`,
`got 6.7.1`), each of which Seal also remediates to a sealed build.

---

## How the exploit works

The app spreads the entire URL query string straight into the EJS render call:

```js
const data = { name: 'World', ...req.query };
res.render('page', data, ...)
```

EJS accepts a `settings['view options']` object whose `outputFunctionName` value is written —
**unsanitized** — into the compiled template function body. An attacker can therefore inject
arbitrary JavaScript that runs on the server with the privileges of the Node.js process.

**Normal request**

```
/?name=alice
```

renders `Hello alice!`.

**Exploit request**

```
/?name=Hacker&settings[view%20options][outputFunctionName]=x;setTimeout(function()%7Bprocess.exit(1)%7D,3000);s
```

The server executes `setTimeout(function(){ process.exit(1) }, 3000)`. The page first loads and
clearly states that RCE succeeded; **reload a few seconds later** and you'll get
`ERR_CONNECTION_REFUSED` — the injected code killed the server, proving arbitrary code ran.

> The 3‑second delay is intentional: it lets the response reach the browser before the process
> exits, so you see the "exploit succeeded" page and then a clean crash rather than a frozen tab.

---

## Repository layout

```
.
├── index.js                       # the vulnerable Express app
├── views/                         # EJS templates
├── package.json / package-lock.json
├── Jenkinsfile                    # example Jenkins (Groovy) pipeline with the Seal stage
└── .github/workflows/
    ├── build-and-run.yml          # build + expose the app for browser testing
    └── seal-security.yml          # run Seal remediation, then start the app
```

---

## Prerequisites

Seal is **SaaS, Seal‑hosted** — nothing is installed inside your environment, and all traffic
is **outbound HTTPS on TCP 443** only. To run the remediation you need:

| Secret / credential | Used for | Where it goes |
|---|---|---|
| **Seal token** | Authenticating the Seal CLI | GitHub Actions secret `SEAL_TOKEN` / Jenkins "Secret text" credential `seal-token` |
| **ngrok token** *(optional)* | Exposing the running app to a browser for testing | GitHub Actions secret `NGROK_TOKEN` |

> Configure these in **Settings → Secrets and variables → Actions** (GitHub) or
> **Manage Jenkins → Credentials** (Jenkins). Never commit tokens to the repo.

Allowlist these Seal hosts for outbound 443:
`app.sealsecurity.io`, `authorization.sealsecurity.io`, `cli.sealsecurity.io`, and — for
sealed npm packages — **`npm.sealsecurity.io`**. The CLI binary is downloaded from
`github.com` / `objects.githubusercontent.com`.

---

## Run it locally

```bash
npm install
npm start           # → http://localhost:3001
```

Open `http://localhost:3001/?name=alice` (works), then the exploit URL above (crashes the server).

---

## Remediate with Seal

The Seal CLI runs as **one extra step**, after `npm install` and before packaging. It scans the
resolved dependencies and rewrites the vulnerable ones to their sealed versions, using
**remote** fix mode (policy is managed centrally in the Seal UI).

### Option A — GitHub Actions

Uses [`seal-community/cli-action`](https://github.com/seal-community/cli-action):

```yaml
- uses: seal-community/cli-action@latest
  with:
    mode: fix
    fix_mode: remote
    token: ${{ secrets.SEAL_TOKEN }}
    target: package-lock.json     # the lock file for this ecosystem
```

Run it via **Actions → “Seal Security Remediation” → Run workflow**. See
[`.github/workflows/seal-security.yml`](.github/workflows/seal-security.yml).

### Option B — Jenkins (Groovy pipeline)

A single added stage, after install and before packaging. See [`Jenkinsfile`](Jenkinsfile):

```groovy
stage('Seal') {
  steps {
    sh '''
      curl -fsSL https://github.com/seal-community/cli/releases/download/latest/seal-linux-amd64-latest -o seal
      chmod +x seal
      ./seal fix --mode remote "$SEAL_MANIFEST"   # SEAL_MANIFEST=package-lock.json
    '''
  }
}
```

`SEAL_TOKEN` comes from the `seal-token` Jenkins credential; set `SEAL_PROJECT` to your Seal
Project ID.

---

## What Seal changes

After `seal fix`, the vulnerable dependencies resolve to sealed builds from Seal's registry —
your `package.json` version *ranges* stay the same:

| Dependency | Before | After (sealed) |
|---|---|---|
| ejs | 2.7.4 | **2.7.4‑sp1** |
| lodash | 4.17.5 | **4.17.5‑sp1** |
| json5 | 0.5.1 | **0.5.1‑sp1** |
| got | 6.7.1 | **6.7.1‑sp1** |

A sealed version is the *same* package with the security fix backported, so it's a drop‑in
replacement — no code changes, no major‑version upgrade.

## Verify the fix

Re‑run the exploit URL against the remediated app. The injection no longer executes: the sealed
`ejs` rejects the malicious `outputFunctionName` and the app responds with **“Invalid parameter”**
instead of running the payload. The server stays up.

---

## How to add Seal to your own project

1. Add **one step** to your pipeline, **after** dependencies are installed and **before**
   packaging/bundling.
2. Point `seal fix` at the specific manifest/lock file — `package-lock.json` for npm. For a repo
   with multiple manifests, run one `seal fix` per manifest.
3. Use **remote** fix mode so your security team manages remediation policy centrally in the
   Seal UI — nothing is committed to the repo.
4. Provide the Seal token via your CI secret store (GitHub secret / Jenkins credential).

That's the whole integration — one stage, outbound‑only, no changes to application code.
