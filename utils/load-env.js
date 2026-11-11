const fs = require('node:fs');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(
        /^(?:"(.*)"|'(.*)')$/,
        (_, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted,
      );
    }
  }
}

module.exports = { loadEnvFile };
