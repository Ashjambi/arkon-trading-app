const fs = require('fs');
let code = fs.readFileSync('src/utils/mqlCode.ts', 'utf8');

const search = `        } else {
            Print("❌ Bridge Connection Error during SendState. HTTP Code: ", res);
        }`;

const replace = `        } else {
            if(res == 1003 || res == 302) {
                Print("❌ Bridge Connection Error: AI Studio Preview URL blocked the request (Cookie/JS Check).");
                Print("💡 FIX: Run the app locally (127.0.0.1:3000) or Deploy it to a production server.");
            } else {
                Print("❌ Bridge Connection Error during SendState. HTTP Code: ", res);
            }
        }`;

code = code.replace(search, replace);
fs.writeFileSync('src/utils/mqlCode.ts', code);
