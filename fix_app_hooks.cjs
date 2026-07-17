const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
    "  const [ethAnalysis, setEthAnalysis] = useState<MarketAnalysisState | null>(\n    null,\n  );\n  const btcDataRef = useRef<{ summary?: any; ticker?: any; book?: any }>({});\n  const ethDataRef = useRef<{ summary?: any; ticker?: any; book?: any }>({});",
    `  const [ethAnalysis, setEthAnalysis] = useState<MarketAnalysisState | null>(null);
  const [solAnalysis, setSolAnalysis] = useState<MarketAnalysisState | null>(null);
  const [goldAnalysis, setGoldAnalysis] = useState<MarketAnalysisState | null>(null);

  const btcDataRef = useRef<{ summary?: any; ticker?: any; book?: any }>({});
  const ethDataRef = useRef<{ summary?: any; ticker?: any; book?: any }>({});
  const solDataRef = useRef<{ summary?: any; ticker?: any; book?: any }>({});
  const goldDataRef = useRef<{ summary?: any; ticker?: any; book?: any }>({});`
);

fs.writeFileSync('src/App.tsx', code);
console.log("Updated React Hooks");
