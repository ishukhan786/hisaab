/**
 * Hisaab — Urdu Short Amount Utility
 * Pakistani/Indian Numbering System: hazaar, lakh, crore.
 * Display only the highest relevant unit portion in Urdu words.
 */
(function (global) {
  'use strict';

  var URDU_NUMBERS_1_TO_99 = {
    1: 'ایک', 2: 'دو', 3: 'تین', 4: 'چار', 5: 'پانچ', 6: 'چھ', 7: 'سات', 8: 'آٹھ', 9: 'نو', 10: 'دس',
    11: 'گیارہ', 12: 'بارہ', 13: 'تیرہ', 14: 'چودہ', 15: 'پندرہ', 16: 'سولہ', 17: 'سترہ', 18: 'اٹھارہ', 19: 'انیس', 20: 'بیس',
    21: 'اکیس', 22: 'بائیس', 23: 'تئیس', 24: 'چوبیس', 25: 'پچیس', 26: 'چھبیس', 27: 'ستائیس', 28: 'اٹھائیس', 29: 'انتیس', 30: 'تیس',
    31: 'اکتیس', 32: 'بتیس', 33: 'تینتیس', 34: 'چونتیس', 35: 'پینتیس', 36: 'چھتیس', 37: 'سینتیس', 38: 'اڑتیس', 39: 'انتالیس', 40: 'چالیس',
    41: 'اکتالیس', 42: 'بیالیس', 43: 'تینتالیس', 44: 'چوالیس', 45: 'پینتالیس', 46: 'چھیالیس', 47: 'سینتالیس', 48: 'اڑتالیس', 49: 'انچاس', 50: 'پچاس',
    51: 'اکیاون', 52: 'باون', 53: 'ترپن', 54: 'چون', 55: 'پچپن', 56: 'چھپن', 57: 'ستاون', 58: 'اٹھاون', 59: 'انسٹھ', 60: 'ساٹھ',
    61: 'اکسٹھ', 62: 'باسٹھ', 63: 'تریسٹھ', 64: 'چونسٹھ', 65: 'پینسٹھ', 66: 'چھیاسٹھ', 67: 'سڑسٹھ', 68: 'اڑسٹھ', 69: 'انہتر', 70: 'ستر',
    71: 'اکہتر', 72: 'بہتر', 73: 'تہتر', 74: 'چوہتر', 75: 'پچہتر', 76: 'چھہتر', 77: 'ستتر', 78: 'اٹھہتر', 79: 'اناسی', 80: 'اسی',
    81: 'اکیاسی', 82: 'بیاسی', 83: 'تراسی', 84: 'چوراسی', 85: 'پچاسی', 86: 'چھیاسی', 87: 'ستاسی', 88: 'اٹھاسی', 89: 'نواسی', 90: 'نوے',
    91: 'اکانوے', 92: 'بانوے', 93: 'ترانوے', 94: 'چورانوے', 95: 'پچانوے', 96: 'چھیانوے', 97: 'ستانوے', 98: 'اٹھانوے', 99: 'ننانوے'
  };

  var CRORE = 10000000n;
  var LAKH = 100000n;
  var HAZAR = 1000n;
  var SAU = 100n;

  function parseAmountToBigInt(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'bigint') return v < 0n ? -v : v;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return null;
      return BigInt(Math.trunc(Math.abs(v)));
    }
    if (typeof v === 'string') {
      var s = v.trim();
      if (!s) return null;
      s = s.replace(/[۰-۹]/g, function (c) { return String(c.charCodeAt(0) - 1776); })
           .replace(/[٠-٩]/g, function (c) { return String(c.charCodeAt(0) - 1632); })
           .replace(/٫/g, '.')
           .replace(/٬/g, ',');
      s = s.replace(/[,\s]/g, '');
      if (!s) return null;
      if (s.startsWith('-') || s.startsWith('+')) s = s.slice(1);
      if (s.includes('.')) s = s.split('.')[0];
      if (!/^\d+$/.test(s)) return null;
      try {
        return BigInt(s);
      } catch (_) {
        return null;
      }
    }
    return null;
  }

  function amountToUrduShort(amount) {
    var val = parseAmountToBigInt(amount);
    if (val === null) return '';
    if (val === 0n) return 'صفر';
    if (val >= CRORE) {
      var crores = val / CRORE;
      var prefix = crores < 100n ? URDU_NUMBERS_1_TO_99[Number(crores)] : amountToUrduShort(crores);
      return prefix + ' کروڑ';
    }
    if (val >= LAKH) {
      var lakhs = val / LAKH;
      return URDU_NUMBERS_1_TO_99[Number(lakhs)] + ' لاکھ';
    }
    if (val >= HAZAR) {
      var hazar = val / HAZAR;
      return URDU_NUMBERS_1_TO_99[Number(hazar)] + ' ہزار';
    }
    if (val >= SAU) {
      var sau = val / SAU;
      return URDU_NUMBERS_1_TO_99[Number(sau)] + ' سو';
    }
    return URDU_NUMBERS_1_TO_99[Number(val)] || '';
  }

  var api = {
    amountToUrduShort: amountToUrduShort,
    parseAmountToBigInt: parseAmountToBigInt,
    URDU_NUMBERS_1_TO_99: URDU_NUMBERS_1_TO_99
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof global !== 'undefined') {
    global.HisaabUrdu = api;
    global.amountToUrduShort = amountToUrduShort;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
