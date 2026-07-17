const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const search = `  app.post(\`\${API_PREFIX}/signals\`, (req, res) => {`;
const replace = `  app.post(\`\${API_PREFIX}/mt5/error\`, (req, res) => {
    const { id, error, message, asset } = req.body;
    console.log(\`[MT5 ERROR] Signal \${id} failed: \${error} - \${message}\`);
    // We can store this in a global array and expose it via an endpoint
    if (!global.mt5Errors) global.mt5Errors = [];
    global.mt5Errors.push({ id, error, message, asset, timestamp: Date.now() });
    if (global.mt5Errors.length > 100) global.mt5Errors.shift();
    res.json({ status: 'recorded' });
  });

  app.get(\`\${API_PREFIX}/mt5/errors\`, (req, res) => {
    res.json(global.mt5Errors || []);
    global.mt5Errors = []; // clear after reading
  });

  app.post(\`\${API_PREFIX}/signals\`, (req, res) => {`;

if (code.includes(search)) {
    code = code.replace(search, replace);
    fs.writeFileSync('server.ts', code);
    console.log("Added /mt5/error endpoint");
} else {
    console.log("Could not find search block");
}
