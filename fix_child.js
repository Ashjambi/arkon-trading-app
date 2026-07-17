const fs = require('fs');
let code = fs.readFileSync('src/services/ChildOrderSchedulerService.ts', 'utf8');

const targetContent = `  sliceIndex: number;
  totalSlices: number;
};`;

const replaceContent = `  sliceIndex: number;
  totalSlices: number;
  dispatchMode?: 'immediate' | 'staggered';
  intervalMs?: number;
  scheduledAtOffsetMs?: number;
  timingPolicy?: 'sequential_immediate' | 'fixed_interval';
};`;

code = code.replace(targetContent, replaceContent);
fs.writeFileSync('src/services/ChildOrderSchedulerService.ts', code);
