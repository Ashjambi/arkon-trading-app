const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Change handleSendSignal signature
content = content.replace(
  "const handleSendSignal = useCallback(\n    async (\n      originalSignal: any,\n      analysis: MarketAnalysisState,\n      actionType: string = \"ENTRY\",\n    ): Promise<boolean> => {",
  `const handleSendSignal = useCallback(
    async (
      signalsOrSignal: any | any[],
      analysis: MarketAnalysisState,
      actionType: string = "ENTRY",
    ): Promise<boolean> => {
      const signalsToProcess = Array.isArray(signalsOrSignal) ? signalsOrSignal : [signalsOrSignal];
      const originalSignal = signalsToProcess[0];`
);

// 2. Change executePlan call inside handleSendSignal
content = content.replace(
  "const success = await executionOrchestrator.executePlan(\n          signalsToProcess,\n          analysis,\n          actionType,\n          crlState\n        );",
  `const success = await executionOrchestrator.executePlan(
          signalsToProcess,
          analysis,
          actionType,
          crlState
        );`
);

// 3. At line 966, pass `signalsToProcess` instead of `signal`
content = content.replace(
  "handleSendSignal(\n                          signal,",
  "handleSendSignal(\n                          signalsToProcess,"
);

// 4. In App.tsx closeSignal call
content = content.replace(
  "await handleSendSignal(closeSignal as any, analysis, \"CLOSE\");",
  "await handleSendSignal([closeSignal as any], analysis, \"CLOSE\");"
);

fs.writeFileSync('src/App.tsx', content);
