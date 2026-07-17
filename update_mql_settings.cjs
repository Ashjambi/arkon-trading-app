const fs = require('fs');
let code = fs.readFileSync('src/components/Mql5Settings.tsx', 'utf8');

if (code.includes('v50.00')) {
    code = code.replace(/v50\.00/g, 'v51.00');
    fs.writeFileSync('src/components/Mql5Settings.tsx', code);
    console.log('Updated v50.00 to v51.00 in Mql5Settings.tsx');
} else {
    console.log('v50.00 not found');
}
