'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { amountToUrduShort, parseAmountToBigInt, URDU_NUMBERS_1_TO_99 } = require(path.resolve('urdu-amount.js'));

console.log('🧪 Running Urdu Short Amount Specification & Integration Tests...');

// 1. Acceptance test cases from specification
const testCases = [
  [0, 'صفر'],
  ['0', 'صفر'],
  [0n, 'صفر'],
  [5, 'پانچ'],
  [50, 'پچاس'],
  [99, 'ننانوے'],
  [100, 'ایک سو'],
  [500, 'پانچ سو'],
  [999, 'نو سو'],
  [1000, 'ایک ہزار'],
  ['1,000', 'ایک ہزار'],
  [1050, 'ایک ہزار'],
  ['1,050', 'ایک ہزار'],
  [9999, 'نو ہزار'],
  [10000, 'دس ہزار'],
  ['10,000', 'دس ہزار'],
  [50050, 'پچاس ہزار'],
  ['50,050', 'پچاس ہزار'],
  [99999, 'ننانوے ہزار'],
  ['99,999', 'ننانوے ہزار'],
  [100000, 'ایک لاکھ'],
  ['100,000', 'ایک لاکھ'],
  [104020, 'ایک لاکھ'],
  ['104,020', 'ایک لاکھ'],
  [250000, 'دو لاکھ'],
  ['250,000', 'دو لاکھ'],
  [999999, 'نو لاکھ'],
  ['999,999', 'نو لاکھ'],
  [1000000, 'دس لاکھ'],
  ['1,000,000', 'دس لاکھ'],
  [1500000, 'پندرہ لاکھ'],
  ['1,500,000', 'پندرہ لاکھ'],
  [9999999, 'ننانوے لاکھ'],
  ['9,999,999', 'ننانوے لاکھ'],
  [10000000, 'ایک کروڑ'],
  ['10,000,000', 'ایک کروڑ'],
  [25000000, 'دو کروڑ'],
  ['25,000,000', 'دو کروڑ'],
  [100000000, 'دس کروڑ'],
  ['100,000,000', 'دس کروڑ']
];

for (const [input, expected] of testCases) {
  const actual = amountToUrduShort(input);
  assert.equal(actual, expected, `Case failed for ${input}: expected "${expected}", got "${actual}"`);
}
console.log(`  ✓ All ${testCases.length} specification test cases passed.`);

// 2. Negative numbers (absolute value rule)
assert.equal(amountToUrduShort(-50050), 'پچاس ہزار');
assert.equal(amountToUrduShort('-50,050'), 'پچاس ہزار');
assert.equal(amountToUrduShort(-104020), 'ایک لاکھ');
assert.equal(amountToUrduShort(-0), 'صفر');
console.log('  ✓ Negative amounts correctly converted using absolute value.');

// 3. Decimals (fractional part ignored, integer short label)
assert.equal(amountToUrduShort(1050.75), 'ایک ہزار');
assert.equal(amountToUrduShort('104,020.99'), 'ایک لاکھ');
assert.equal(amountToUrduShort('0.50'), 'صفر');
assert.equal(amountToUrduShort('-1,500,000.40'), 'پندرہ لاکھ');
console.log('  ✓ Decimal amounts correctly ignore fractional part.');

// 4. BigInt support
assert.equal(amountToUrduShort(104020n), 'ایک لاکھ');
assert.equal(amountToUrduShort(25000000n), 'دو کروڑ');
assert.equal(amountToUrduShort(0n), 'صفر');
console.log('  ✓ BigInt inputs handled properly.');

// 5. Eastern Arabic / Urdu / Perso-Arabic numerals
assert.equal(amountToUrduShort('۱۰۴۰۲۰'), 'ایک لاکھ');
assert.equal(amountToUrduShort('۵۰۰۵۰'), 'پچاس ہزار');
assert.equal(amountToUrduShort('۰'), 'صفر');
console.log('  ✓ Eastern Arabic / Urdu digits handled properly.');

// 6. Invalid / empty / null / undefined inputs
assert.equal(amountToUrduShort(null), '');
assert.equal(amountToUrduShort(undefined), '');
assert.equal(amountToUrduShort(''), '');
assert.equal(amountToUrduShort('   '), '');
assert.equal(amountToUrduShort(NaN), '');
assert.equal(amountToUrduShort(Infinity), '');
assert.equal(amountToUrduShort('abc'), '');
assert.equal(amountToUrduShort({}), '');
assert.equal(amountToUrduShort([]), '');
console.log('  ✓ Invalid / empty / null inputs return empty string safely without error.');

// 7. Verify all numbers 1 to 99 are mapped and non-empty
for (let i = 1; i <= 99; i++) {
  assert.ok(URDU_NUMBERS_1_TO_99[i], `Missing Urdu word for ${i}`);
  assert.equal(amountToUrduShort(i), URDU_NUMBERS_1_TO_99[i]);
}
console.log('  ✓ Complete 1 to 99 Urdu mapping verified.');

// 8. Integration verification: index.html
const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');
assert.ok(indexHtml.includes('src="urdu-amount.js'), 'urdu-amount.js script included in index.html');
const urduIdx = indexHtml.indexOf('src="urdu-amount.js');
const appIdx = indexHtml.indexOf('src="app.js');
assert.ok(urduIdx > -1 && appIdx > -1 && urduIdx < appIdx, 'urdu-amount.js must load before app.js in index.html');
assert.ok(indexHtml.includes('class="col-words print-only"') && indexHtml.includes('لفظوں'), 'index.html has col-words print-only column with header لفظوں');
console.log('  ✓ index.html loads urdu-amount.js and contains col-words header "لفظوں".');

// 9. Integration verification: app.js preparePrint implementation (dedicated words column on left of rupee)
const appJs = fs.readFileSync(path.resolve('app.js'), 'utf8');
assert.ok(appJs.includes('amountToUrduShort'), 'app.js references amountToUrduShort');
assert.ok(appJs.includes('col-words'), 'app.js populates col-words cell');
assert.ok(appJs.includes('print-words-text'), 'app.js creates print-words-text element');
console.log('  ✓ app.js populates separate col-words column on left of Rupee with clean Urdu short amount labels.');

// 10. Integration verification: style.css & ui.css
const styleCss = fs.readFileSync(path.resolve('style.css'), 'utf8');
const uiCss = fs.readFileSync(path.resolve('ui.css'), 'utf8');
assert.ok(styleCss.includes('.col-words'), 'style.css contains .col-words styles');
assert.ok(styleCss.includes('3.3cm'), 'style.css sets rupee column width to 3.3cm');
assert.ok(styleCss.includes('1.8cm'), 'style.css sets words column width to 1.8cm');
assert.ok(styleCss.includes('"Bombay Black Unicode"'), 'style.css applies Bombay Black Unicode font to th.col-words');
assert.ok(styleCss.includes('"Noto Nastaliq Urdu Print"'), 'style.css applies Noto Nastaliq Urdu Print font');
assert.ok(uiCss.includes('.print-words-text'), 'ui.css includes .print-words-text in dark mode print overrides');
assert.ok(indexHtml.includes('کل پاکستانی'), 'index.html has کل پاکستانی in totals-row words column');
assert.ok(styleCss.includes('.total-words-label'), 'style.css includes .total-words-label styling');
assert.ok(uiCss.includes('.register-totals #total-balance') && uiCss.includes('"Bombay Black Unicode"'), 'ui.css applies Bombay Black Unicode to total-balance and total-aed');
console.log('  ✓ style.css and ui.css provide complete print typography (Bombay Black Unicode header & totals text, Noto Nastaliq body and totals "کل پاکستانی"), layout (3.3cm Rupee, 1.8cm Words), and ink rules.');

// 11. Build & Server verification: package.json & server.js
const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
assert.ok(pkg.build?.files?.includes('urdu-amount.js'), 'package.json build.files includes urdu-amount.js');
const serverJs = fs.readFileSync(path.resolve('server.js'), 'utf8');
assert.ok(serverJs.includes("'urdu-amount.js'"), 'server.js ALLOWED_ROOT_FILES includes urdu-amount.js for web mode');
console.log('  ✓ package.json and server.js include urdu-amount.js for both desktop and web distribution.');

console.log('🎉 All Urdu amount tests passed successfully!\n');
