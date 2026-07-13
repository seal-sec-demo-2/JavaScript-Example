// index.js
const express = require('express')
const app = express()
const port = 3001;

app.set('view engine', 'ejs');

// Was the request an EJS `outputFunctionName` injection attempt?
// (CVE-2022-29078 is delivered via ?settings[view options][outputFunctionName]=...)
function isExploitAttempt(req) {
  return req.query.settings != null;
}

app.get('/', (req, res) => {
  const data = { name: 'World', ...req.query };
  res.render('page', data, (err, html) => {
    if (err) {
      // Patched EJS (Seal-remediated / >=3.1.7) rejects the injected identifier,
      // so the exploit is blocked. Show that the payload was refused.
      if (err.message.includes('outputFunctionName')) {
        res.send("<h1>Invalid parameter — exploit blocked</h1>").end();
      }
      else {
        res.send(err.stack).end();
      }
      return;
    }

    // Vulnerable EJS renders successfully AND has already executed the attacker's
    // injected JavaScript during compilation — the scheduled process.exit is now
    // ticking. Return a page that makes that outcome obvious instead of an
    // innocuous "Hello" page, and close the connection so the browser finishes
    // loading cleanly before the process dies.
    if (isExploitAttempt(req)) {
      res.set('Connection', 'close');
      res.send(`<!doctype html><html><head><meta charset="utf-8"><title>RCE triggered</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:12vh auto;padding:0 24px;line-height:1.5}
.card{border:1px solid #e11d1d;border-radius:10px;padding:24px}
h1{color:#b91c1c;margin:0 0 12px}code{background:#f3f4f6;padding:2px 6px;border-radius:4px}</style></head>
<body><div class="card">
<h1>&#9888; Remote code execution succeeded</h1>
<p>The server just executed attacker-supplied JavaScript via the vulnerable
<code>ejs</code> <code>outputFunctionName</code> option (CVE-2022-29078).</p>
<p>The injected payload scheduled <code>process.exit(1)</code>, so this Node.js
process is about to terminate. <strong>Reload this page in a few seconds</strong> —
you should get <code>ERR_CONNECTION_REFUSED</code>, confirming the exploit killed the server.</p>
</div></body></html>`).end();
      return;
    }

    res.send(html).end();
  });
})

const server = app.listen(port, () => {
  console.debug(`App is running!`);
})
