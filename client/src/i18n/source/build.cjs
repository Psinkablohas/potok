// Собирает словари uk/en/zh/de из таблиц partN.txt: «ключ‖uk‖en‖zh‖de»
const fs = require('fs');
const path = require('path');
const LANGS = ['uk', 'en', 'zh', 'de'];
const out = Object.fromEntries(LANGS.map((l) => [l, {}]));
const unesc = (s) => s.replace(/\\n/g, '\n');
for (const f of fs.readdirSync(__dirname).filter((x) => /^part\d+\.txt$/.test(x)).sort()) {
  fs.readFileSync(path.join(__dirname, f), 'utf8').split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    const cols = line.split('‖');
    if (cols.length !== 5) throw new Error(`${f}:${i + 1}: ожидалось 5 колонок, найдено ${cols.length}`);
    LANGS.forEach((l, j) => { out[l][unesc(cols[0])] = unesc(cols[j + 1]); });
  });
}
for (const l of LANGS) {
  const body = JSON.stringify(out[l], null, 1);
  fs.writeFileSync(path.join(__dirname, '..', `${l}.js`), `// Сгенерировано из i18n/source/*.txt — правьте таблицы, а не этот файл\nexport default ${body};\n`);
}
console.log('entries', Object.keys(out.en).length);
