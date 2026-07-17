const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Add global variable
if (!code.includes('let lastMT5SyncTime = 0;')) {
    code = code.replace(
        'let isInitialSync = true;',
        'let isInitialSync = true;\nlet lastMT5SyncTime = 0;'
    );
}

// Update lastMT5SyncTime in /mt5/sync
const search1 = `  app.post(\`\${API_PREFIX}/mt5/sync\`, (req, res) => {
    try {
        const { positions, crl_baseline, crl_current, crl_diff, crl_budget, crl_threshold, equity } = req.body;`;

const replace1 = `  app.post(\`\${API_PREFIX}/mt5/sync\`, (req, res) => {
    try {
        lastMT5SyncTime = Date.now();
        const { positions, crl_baseline, crl_current, crl_diff, crl_budget, crl_threshold, equity } = req.body;`;

if (code.includes(search1)) {
    code = code.replace(search1, replace1);
}

// Expose in bridge/status
const search2 = `  app.get(\`\${API_PREFIX}/bridge/status\`, (req, res) => {
    res.json({ status: 'online', version: '4.2', queue_depth: signalQueue.length });
  });`;

const replace2 = `  app.get(\`\${API_PREFIX}/bridge/status\`, (req, res) => {
    res.json({ 
        status: 'online', 
        version: '4.2', 
        queue_depth: signalQueue.length,
        lastMT5SyncTime
    });
  });`;

if (code.includes(search2)) {
    code = code.replace(search2, replace2);
}

fs.writeFileSync('server.ts', code);
