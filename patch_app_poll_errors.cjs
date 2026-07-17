const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const search = `        fetchBridgeState(config.webhookUrl).then((bridgeState: any) => {`;
const replace = `        // Fetch MT5 Errors
        const effectiveUrl = getEffectiveUrl(config.webhookUrl);
        fetch(\`\${effectiveUrl.replace(/\\/$/, "")}/api/mt5/errors\`)
          .then(res => res.json())
          .then(errors => {
             if (errors && errors.length > 0) {
                 errors.forEach((err: any) => {
                     if (err.error === 'BROKER_SYMBOL_NOT_RESOLVED') {
                         executionSanityDiagnosticService.recordRejection(err.id, 'execution_orchestrator', 'BROKER_SYMBOL_NOT_RESOLVED', err.message);
                         addLog(\`❌ MT5 Bridge Error: \${err.message}\`, 'ERROR');
                     }
                 });
             }
          })
          .catch(() => {});

        fetchBridgeState(config.webhookUrl).then((bridgeState: any) => {`;

if (code.includes(search)) {
    code = code.replace(search, replace);
    fs.writeFileSync('src/App.tsx', code);
    console.log("Patched App.tsx to poll errors");
} else {
    console.log("Could not find search block");
}
