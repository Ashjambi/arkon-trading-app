const fs = require('fs');
const path = require('path');

const walkSync = (dir, filelist = []) => {
  fs.readdirSync(dir).forEach(file => {
    filelist = fs.statSync(path.join(dir, file)).isDirectory()
      ? walkSync(path.join(dir, file), filelist)
      : filelist.concat(path.join(dir, file));
  });
  return filelist;
};

const files = walkSync('./src/services/strategies');
files.forEach(file => {
  if (!file.endsWith('.ts')) return;
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('return {\nreturn {')) {
    content = content.replace(/return {\nreturn {/g, 'return {');
    // Also check if there's an extra `};` at the end
    // Actually the error was: `error TS1005: ':' expected.` 
    // Wait, the error is at line 40: `return {` inside an object.
    
    // The replace I did earlier was: `return {\n${match...` which already had `return {`
    // Let's just fix `return {\nreturn {` to `return {`
    
    // Let's also check if we messed up the object end
  }
  
  // Actually, wait. It says: 
  // src/services/strategies/BTC/BTC_MEAN_REV.ts(40,8): error TS1005: ':' expected.
  // Because `return {` inside the object isn't valid syntax.
  
  // `return {\nreturn {` -> `return {`
  content = content.replace(/return {\s+return {/gm, 'return {');
  
  // Let's check for extra `};\n\n    }\n    return null;`
  content = content.replace(/};\n\s*};\n\n\s*}\n\s*return null;/gm, '};\n    }\n    return null;');
  
  fs.writeFileSync(file, content, 'utf8');
});
