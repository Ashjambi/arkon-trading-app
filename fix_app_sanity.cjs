const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Import
if (!code.includes('import { DiagnosticsSettings }')) {
    code = code.replace(
        'import { Mql5Settings } from "./components/Mql5Settings";',
        'import { Mql5Settings } from "./components/Mql5Settings";\nimport { DiagnosticsSettings } from "./components/DiagnosticsSettings";'
    );
}

// 2. Add to settingsTab state
code = code.replace(
    `"ENGINE" | "RISK_COMPLIANCE" | "STRATEGY" | "CHASE" | "SYSTEM" | "MQL5"`,
    `"ENGINE" | "RISK_COMPLIANCE" | "STRATEGY" | "CHASE" | "SYSTEM" | "MQL5" | "DIAGNOSTICS"`
);

// 3. Add to navigation array
const navSearch = `{ id: "MQL5", label: "كود الميتاتريدر (MQL5)", icon: "code" },`;
const navReplace = `{ id: "MQL5", label: "كود الميتاتريدر (MQL5)", icon: "code" },\n                { id: "DIAGNOSTICS", label: "التشخيص (Diagnostics)", icon: "stethoscope" },`;
code = code.replace(navSearch, navReplace);

// 4. Add render block
const renderSearch = `{/* 9. MQL5 CODE */}
                {settingsTab === "MQL5" && (
                  <Mql5Settings config={config} addLog={addLog} />
                )}`;
const renderReplace = `{/* 9. MQL5 CODE */}
                {settingsTab === "MQL5" && (
                  <Mql5Settings config={config} addLog={addLog} />
                )}

                {/* 10. DIAGNOSTICS */}
                {settingsTab === "DIAGNOSTICS" && (
                  <DiagnosticsSettings />
                )}`;
code = code.replace(renderSearch, renderReplace);

fs.writeFileSync('src/App.tsx', code);
