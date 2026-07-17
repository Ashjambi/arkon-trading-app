const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const search = `        // Fetch MT5 Errors
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
          .catch(() => {}),`;
const replace = `        // Fetch MT5 Errors
        (async () => {
          try {
            const effectiveUrl = getEffectiveUrl(config.webhookUrl);
            const res = await fetch(\`\${effectiveUrl.replace(/\\/$/, "")}/api/mt5/errors\`);
            const errors = await res.json();
            if (errors && errors.length > 0) {
                 errors.forEach((err: any) => {
                     if (err.error === 'BROKER_SYMBOL_NOT_RESOLVED') {
                         executionSanityDiagnosticService.recordRejection(err.id, 'execution_orchestrator', 'BROKER_SYMBOL_NOT_RESOLVED', err.message);
                         addLog(\`❌ MT5 Bridge Error: \${err.message}\`, 'ERROR');
                     }
                 });
             }
          } catch(e) {}
        })(),`;

let searchNoComma = search.slice(0, -1);
let replaceNoComma = replace.slice(0, -1);

if (code.includes(searchNoComma)) {
    code = code.replace(searchNoComma, replaceNoComma);
    fs.writeFileSync('src/App.tsx', code);
    console.log("Patched App.tsx syntax");
} else {
    console.log("Still not found");
}
