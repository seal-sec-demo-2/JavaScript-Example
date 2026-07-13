// Example Jenkins pipeline (Groovy, declarative) that integrates Seal Security.
//
// The Seal CLI runs as ONE extra stage in the build — after dependencies are
// installed and before packaging/bundling. It scans the resolved dependencies
// and replaces vulnerable packages with sealed (backported, drop-in) versions
// pulled over outbound HTTPS from Seal's registry.
//
// Fix mode is "remote": the CLI fetches sealing rules from the Seal platform
// for this project. Remediation policy is managed centrally in the Seal UI —
// nothing is committed to this repo.

pipeline {
    agent any

    environment {
        // Seal authentication token.
        // Create a Jenkins "Secret text" credential (Manage Jenkins > Credentials)
        // with the ID below and paste your Seal token as its value.
        SEAL_TOKEN    = credentials('seal-token')

        // Your Seal Project ID (Seal issues one per application). Replace the
        // placeholder with the value from your Seal tenant.
        SEAL_PROJECT  = 'seal-javascript-example'

        // Always point `seal fix` at the specific lock file for this ecosystem
        // (package-lock.json for npm), not a directory.
        SEAL_MANIFEST = 'package-lock.json'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install dependencies') {
            steps {
                sh 'npm ci || npm install --no-audit'
            }
        }

        // ─── The only Seal-specific stage ────────────────────────────────────
        stage('Seal') {
            steps {
                sh '''
                    curl -fsSL https://github.com/seal-community/cli/releases/download/latest/seal-linux-amd64-latest -o seal
                    chmod +x seal
                    ./seal fix --mode remote "$SEAL_MANIFEST"
                '''
            }
        }
        // ─────────────────────────────────────────────────────────────────────

        stage('Build') {
            steps {
                // Build against the sealed node_modules that `seal fix` just wrote.
                //
                // IMPORTANT: do NOT run `npm install` after the Seal stage. `seal fix`
                // patches the installed packages in node_modules in place; a fresh
                // install would restore the original (vulnerable) packages from the
                // lockfile and undo the remediation. Seal must be the LAST step that
                // touches dependencies, immediately before build/bundle.
                sh 'npm run build --if-present'
            }
        }
    }
}
