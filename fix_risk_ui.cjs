const fs = require('fs');
let code = fs.readFileSync('src/components/RiskManagementSettings.tsx', 'utf8');

const additionalInputs = `
            </div>
            <div className="p-4 bg-zinc-900 rounded-xl text-white text-xs font-bold">
            حجم اللوت (SOL):
            <input 
                type="number" 
                step="0.1"
                min="0.1"
                value={config.fixedLotSizeSOL} 
                onChange={(e) => setConfig(prev => ({ ...prev, fixedLotSizeSOL: parseFloat(e.target.value) }))}
                className="w-full mt-2 bg-zinc-800 p-2 rounded"
            />
            </div>
            <div className="p-4 bg-zinc-900 rounded-xl text-white text-xs font-bold">
            حجم اللوت (GOLD):
            <input 
                type="number" 
                step="0.01"
                min="0.01"
                value={config.fixedLotSizeGOLD} 
                onChange={(e) => setConfig(prev => ({ ...prev, fixedLotSizeGOLD: parseFloat(e.target.value) }))}
                className="w-full mt-2 bg-zinc-800 p-2 rounded"
            />
            </div>
`;

code = code.replace(
    'value={config.fixedLotSizeETH} \n                onChange={(e) => setConfig(prev => ({ ...prev, fixedLotSizeETH: parseFloat(e.target.value) }))}\n                className="w-full mt-2 bg-zinc-800 p-2 rounded"\n            />\n            </div>',
    'value={config.fixedLotSizeETH} \n                onChange={(e) => setConfig(prev => ({ ...prev, fixedLotSizeETH: parseFloat(e.target.value) }))}\n                className="w-full mt-2 bg-zinc-800 p-2 rounded"\n            />' + additionalInputs
);

fs.writeFileSync('src/components/RiskManagementSettings.tsx', code);
console.log("Updated RiskManagementSettings");
