const fs = require('fs');

function fixTPLogic(file) {
    let code = fs.readFileSync(file, 'utf8');
    
    const oldLogic = `        // Dynamic Target Profit scaling: Scale the TargetDollarProfit by the position volume relative to minimum volume.
        // This ensures the profit target scales proportionally when your equity and lot sizes increase!
        double minVol = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
        if(minVol <= 0) minVol = 0.01;
        double dynamicTP = TargetDollarProfit * (volume / minVol);
        
        // Native local close!
        if (netProfit >= dynamicTP) {
            Print("Local EA Dynamic TP Hit! Profit: $", DoubleToString(netProfit, 2), " >= $", DoubleToString(dynamicTP, 2), " (Scaled from $", DoubleToString(TargetDollarProfit, 2), " for vol ", DoubleToString(volume, 2), "). Closing ticket ", ticket);`;

    const newLogic = `        // Native local close! Hard TP in USD regardless of volume.
        if (netProfit >= TargetDollarProfit) {
            Print("Local EA TP Hit! Profit: $", DoubleToString(netProfit, 2), " >= $", DoubleToString(TargetDollarProfit, 2), ". Closing ticket ", ticket);`;
            
    code = code.replace(oldLogic, newLogic);
    
    // In case there is another variant in ArkonExpert.mq5
    code = code.replace(/        \/\/ Dynamic Target Profit scaling: Scale the TargetDollarProfit[\s\S]*?Closing ticket ", ticket\);/g, newLogic);
    
    fs.writeFileSync(file, code);
}

fixTPLogic('src/utils/mqlCode.ts');
fixTPLogic('ArkonExpert.mq5');
fixTPLogic('ARKON_MT5_EA.mq5');
