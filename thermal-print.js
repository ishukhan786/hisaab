/**
 * Hisaab - Thermal Slip Printer & Verification Engine (80mm / POS standard)
 * Pure vanilla JavaScript, zero external dependencies, 100% offline & CSP-safe.
 */
(() => {
  'use strict';

  // --- Embedded High-Performance Zero-Dependency QR Code Generator ---
  const QRCode = (() => {
    // GF(2^8) Galois Field with primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11D)
    const EXP = new Uint8Array(512);
    const LOG = new Uint8Array(256);
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      EXP[i + 255] = x;
      LOG[x] = i;
      x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
    }

    function gfMul(a, b) {
      if (a === 0 || b === 0) return 0;
      return EXP[LOG[a] + LOG[b]];
    }

    function rsGeneratorPoly(degree) {
      let poly = [1];
      for (let i = 0; i < degree; i++) {
        const next = new Array(poly.length + 1).fill(0);
        const root = EXP[i];
        for (let j = 0; j < poly.length; j++) {
          next[j] ^= gfMul(poly[j], root);
          next[j + 1] ^= poly[j];
        }
        poly = next;
      }
      return poly;
    }

    function rsCalculateCodewords(data, ecCount) {
      const gen = rsGeneratorPoly(ecCount);
      const result = new Array(ecCount).fill(0);
      for (let i = 0; i < data.length; i++) {
        const factor = data[i] ^ result[0];
        for (let j = 0; j < ecCount - 1; j++) {
          result[j] = result[j + 1] ^ gfMul(gen[j + 1], factor);
        }
        result[ecCount - 1] = gfMul(gen[ecCount], factor);
      }
      return result;
    }

    // Version definitions with ECC Level M (15% recovery capacity)
    const VERSIONS_M = [
      null,
      { version: 1, totalCodewords: 26, ecCodewords: 10, dataCodewords: 16, numBlocks: 1, align: [] },
      { version: 2, totalCodewords: 44, ecCodewords: 16, dataCodewords: 28, numBlocks: 1, align: [6, 18] },
      { version: 3, totalCodewords: 70, ecCodewords: 26, dataCodewords: 44, numBlocks: 1, align: [6, 22] },
      { version: 4, totalCodewords: 100, ecCodewords: 36, dataCodewords: 64, numBlocks: 2, align: [6, 26] },
      { version: 5, totalCodewords: 134, ecCodewords: 48, dataCodewords: 86, numBlocks: 2, align: [6, 30] },
      { version: 6, totalCodewords: 172, ecCodewords: 64, dataCodewords: 108, numBlocks: 4, align: [6, 34] },
      { version: 7, totalCodewords: 196, ecCodewords: 72, dataCodewords: 124, numBlocks: 4, align: [6, 22, 38] },
      { version: 8, totalCodewords: 242, ecCodewords: 88, dataCodewords: 154, numBlocks: 4, align: [6, 24, 42] }
    ];

    function encodeUtf8(str) {
      const bytes = [];
      for (let i = 0; i < str.length; i++) {
        let code = str.charCodeAt(i);
        if (code < 0x80) {
          bytes.push(code);
        } else if (code < 0x800) {
          bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
        } else if (code < 0xd800 || code >= 0xe000) {
          bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        } else {
          i++;
          code = 0x10000 + (((code & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
          bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        }
      }
      return bytes;
    }

    function pickVersion(dataByteLength) {
      for (let v = 1; v < VERSIONS_M.length; v++) {
        const info = VERSIONS_M[v];
        if (dataByteLength + 2 <= info.dataCodewords) return info;
      }
      return VERSIONS_M[8];
    }

    function createBitBuffer(dataBytes, vInfo) {
      const bits = [];
      function pushBits(val, len) {
        for (let i = len - 1; i >= 0; i--) {
          bits.push((val >>> i) & 1);
        }
      }
      pushBits(0b0100, 4); // Byte mode indicator
      pushBits(dataBytes.length, 8); // Character count
      for (const b of dataBytes) pushBits(b, 8);
      const capacityBits = vInfo.dataCodewords * 8;
      const termLen = Math.min(4, capacityBits - bits.length);
      pushBits(0, termLen);
      while (bits.length % 8 !== 0) bits.push(0);
      const padBytes = [0xEC, 0x11];
      let padIdx = 0;
      while (bits.length < capacityBits) {
        pushBits(padBytes[padIdx % 2], 8);
        padIdx++;
      }
      const bytes = [];
      for (let i = 0; i < bits.length; i += 8) {
        let byte = 0;
        for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
        bytes.push(byte);
      }
      return bytes;
    }

    function interleaveBlocks(dataCodewords, vInfo) {
      const numBlocks = vInfo.numBlocks;
      const totalData = vInfo.dataCodewords;
      const totalEC = vInfo.ecCodewords;
      const ecPerBlock = Math.floor(totalEC / numBlocks);
      const shortBlockLen = Math.floor(totalData / numBlocks);
      const numLongBlocks = totalData % numBlocks;
      const numShortBlocks = numBlocks - numLongBlocks;

      const dataBlocks = [];
      const ecBlocks = [];
      let offset = 0;
      for (let i = 0; i < numBlocks; i++) {
        const bLen = (i < numShortBlocks) ? shortBlockLen : shortBlockLen + 1;
        const bData = dataCodewords.slice(offset, offset + bLen);
        offset += bLen;
        dataBlocks.push(bData);
        ecBlocks.push(rsCalculateCodewords(bData, ecPerBlock));
      }

      const finalCodewords = [];
      const maxDataLen = shortBlockLen + (numLongBlocks > 0 ? 1 : 0);
      for (let i = 0; i < maxDataLen; i++) {
        for (let b = 0; b < numBlocks; b++) {
          if (i < dataBlocks[b].length) finalCodewords.push(dataBlocks[b][i]);
        }
      }
      for (let i = 0; i < ecPerBlock; i++) {
        for (let b = 0; b < numBlocks; b++) {
          finalCodewords.push(ecBlocks[b][i]);
        }
      }
      return finalCodewords;
    }

    function getFormatBits(ecLevelBits, maskPattern) {
      const data = (ecLevelBits << 3) | maskPattern;
      let rem = data << 10;
      const poly = 0x537;
      for (let i = 14; i >= 10; i--) {
        if ((rem >>> i) & 1) rem ^= poly << (i - 10);
      }
      return ((data << 10) | rem) ^ 0x5412;
    }

    function generateMatrix(text) {
      const rawBytes = encodeUtf8(text);
      const vInfo = pickVersion(rawBytes.length);
      const size = 17 + vInfo.version * 4;
      const matrix = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
      const isReserved = Array.from({ length: size }, () => new Uint8Array(size));

      function setFunctionModule(r, c, val) {
        matrix[r][c] = val ? 1 : 0;
        isReserved[r][c] = 1;
      }

      function drawFinder(r0, c0) {
        for (let r = 0; r < 7; r++) {
          for (let c = 0; c < 7; c++) {
            const isBorder = (r === 0 || r === 6 || c === 0 || c === 6);
            const isCore = (r >= 2 && r <= 4 && c >= 2 && c <= 4);
            setFunctionModule(r0 + r, c0 + c, isBorder || isCore);
          }
        }
        for (let r = -1; r <= 7; r++) {
          for (let c = -1; c <= 7; c++) {
            const gr = r0 + r, gc = c0 + c;
            if (gr >= 0 && gr < size && gc >= 0 && gc < size && !isReserved[gr][gc]) {
              setFunctionModule(gr, gc, 0);
            }
          }
        }
      }
      drawFinder(0, 0);
      drawFinder(0, size - 7);
      drawFinder(size - 7, 0);

      // Timing patterns
      for (let i = 8; i < size - 8; i++) {
        if (!isReserved[6][i]) setFunctionModule(6, i, i % 2 === 0);
        if (!isReserved[i][6]) setFunctionModule(i, 6, i % 2 === 0);
      }

      // Alignment patterns
      if (vInfo.align.length > 0) {
        const coords = vInfo.align;
        for (const r of coords) {
          for (const c of coords) {
            if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
            if (isReserved[r][c]) continue;
            for (let dr = -2; dr <= 2; dr++) {
              for (let dc = -2; dc <= 2; dc++) {
                const isOuter = Math.abs(dr) === 2 || Math.abs(dc) === 2;
                const isCenter = dr === 0 && dc === 0;
                setFunctionModule(r + dr, c + dc, isOuter || isCenter);
              }
            }
          }
        }
      }

      // Dark module
      setFunctionModule(size - 8, 8, 1);

      // Reserve format info modules
      for (let i = 0; i < 9; i++) {
        if (!isReserved[8][i]) isReserved[8][i] = 1;
        if (!isReserved[i][8]) isReserved[i][8] = 1;
      }
      for (let i = 0; i < 8; i++) {
        if (!isReserved[8][size - 1 - i]) isReserved[8][size - 1 - i] = 1;
        if (!isReserved[size - 1 - i][8]) isReserved[size - 1 - i][8] = 1;
      }

      const dataCodewords = createBitBuffer(rawBytes, vInfo);
      const finalCodewords = interleaveBlocks(dataCodewords, vInfo);

      let codewordIndex = 0;
      let bitIndex = 7;
      let upwards = true;

      for (let right = size - 1; right > 0; right -= 2) {
        if (right === 6) right--;
        const rows = [];
        for (let r = 0; r < size; r++) rows.push(upwards ? size - 1 - r : r);
        upwards = !upwards;

        for (const r of rows) {
          for (const c of [right, right - 1]) {
            if (!isReserved[r][c]) {
              let bit = 0;
              if (codewordIndex < finalCodewords.length) {
                bit = (finalCodewords[codewordIndex] >>> bitIndex) & 1;
                bitIndex--;
                if (bitIndex < 0) {
                  bitIndex = 7;
                  codewordIndex++;
                }
              }
              matrix[r][c] = bit;
            }
          }
        }
      }

      const maskPatterns = [
        (r, c) => (r + c) % 2 === 0,
        (r, c) => r % 2 === 0,
        (r, c) => c % 3 === 0,
        (r, c) => (r + c) % 3 === 0,
        (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
        (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
        (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
        (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
      ];

      let bestMask = 0;
      let bestScore = Infinity;
      for (let mask = 0; mask < 8; mask++) {
        const fn = maskPatterns[mask];
        let darkCount = 0;
        for (let r = 0; r < size; r++) {
          for (let c = 0; c < size; c++) {
            const val = isReserved[r][c] ? matrix[r][c] : (matrix[r][c] ^ (fn(r, c) ? 1 : 0));
            if (val === 1) darkCount++;
          }
        }
        const ratio = Math.abs((darkCount / (size * size)) - 0.5);
        if (ratio < bestScore) {
          bestScore = ratio;
          bestMask = mask;
        }
      }

      const maskFn = maskPatterns[bestMask];
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (!isReserved[r][c]) {
            matrix[r][c] ^= (maskFn(r, c) ? 1 : 0);
          }
        }
      }

      // Format info
      const formatInfo = getFormatBits(0b00, bestMask);
      const fmtCoordsTL = [
        [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
        [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8],
        [2, 8], [1, 8], [0, 8]
      ];
      for (let i = 0; i < 15; i++) {
        const bit = (formatInfo >>> i) & 1;
        const [r, c] = fmtCoordsTL[i];
        matrix[r][c] = bit;
      }
      for (let i = 0; i < 7; i++) {
        matrix[size - 1 - i][8] = (formatInfo >>> i) & 1;
      }
      for (let i = 7; i < 15; i++) {
        matrix[8][size - 15 + i] = (formatInfo >>> i) & 1;
      }

      return matrix;
    }

    function toSVG(text, options = {}) {
      const matrix = generateMatrix(text);
      const size = matrix.length;
      // Four-module quiet zone is required by most phone/POS scanners.
      const margin = options.margin ?? 4;
      const viewBoxSize = size + margin * 2;
      let path = '';

      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (matrix[r][c] === 1) {
            path += `M${c + margin},${r + margin}h1v1h-1z `;
          }
        }
      }

      const title = options.title ? `<title>${options.title}</title>` : '';
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges" width="100%" height="100%" class="${options.className || 'thermal-qr-svg'}" role="img" aria-label="QR Code"><rect width="100%" height="100%" fill="#fff"/>${title}<path fill="#000" d="${path}"/></svg>`;
    }

    return { generateMatrix, toSVG };
  })();

  // --- Thermal Slip Controller ---
  const HisaabThermal = {
    QRCode,

    formatTime(date = new Date()) {
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    },

    formatSerial(num) {
      if (!num) return '#0001';
      const clean = String(num).replace(/[^0-9]/g, '');
      return '#' + (clean ? clean.padStart(4, '0') : num);
    },

    populateSlip(values) {
      try {
        const slip = document.getElementById('thermal-slip-paper');
        if (!slip) return;

        const currentTime = this.formatTime();
        const currentUser = (typeof window.HisaabAuth?.getAuth === 'function' ? window.HisaabAuth.getAuth()?.username : null)
          || (typeof window.HisaabAuth?.getCurrentUser === 'function' ? window.HisaabAuth.getCurrentUser()?.username : null)
          || 'ایڈمن';

        // Map values
        const thermalData = {
          serial: this.formatSerial(values.serial),
          date: values.date || values.entryDate || '',
          time: currentTime,
          operator: currentUser,
          sender: values.sender || '—',
          mobile: values.mobile || '—',
          receiver: values.receiver || '—',
          place: values.place || '—',
          pkr: values.pkr || '0',
          'pkr-sub': values.pkr || '0',
          currency: values.currency || 'روپیہ (PKR)',
          aed: values.aed || '0'
        };

        for (const [key, val] of Object.entries(thermalData)) {
          const el = slip.querySelector(`[data-thermal="${key}"]`);
          if (el) el.textContent = val;
        }

        // Hide optional sub-amounts if they are '0' or '—'
        const aedWrap = slip.querySelector('[data-thermal-wrap="aed"]');
        if (aedWrap) {
          const isAedEmpty = !values.aed || values.aed === '0' || values.aed === '—';
          aedWrap.hidden = isAedEmpty;
        }
        const pkrWrap = slip.querySelector('[data-thermal-wrap="pkr"]');
        if (pkrWrap) {
          const isPkrEmpty = !values.pkr || values.pkr === '0';
          pkrWrap.hidden = isPkrEmpty;
        }

        // Generate Verification QR Code
        const qrContainer = document.getElementById('thermal-slip-qr');
        if (qrContainer) {
          try {
            // Keep the payload compact ASCII: it improves compatibility with
            // low-cost thermal scanners while still carrying the receipt data.
            // Keep the QR at the lowest practical density for thermal printers.
            // Full receipt details remain printed beside it; the QR only needs
            // to identify this receipt reliably when scanned.
            const verificationText = `HISAAB|${thermalData.serial}`;

            qrContainer.innerHTML = QRCode.toSVG(verificationText, {
              margin: 4,
              title: 'Hisaab Verified Receipt QR'
            });
          } catch (qrErr) {
            console.warn('QR code generation notice:', qrErr);
          }
        }
      } catch (err) {
        console.warn('HisaabThermal.populateSlip notice:', err);
      }
    },

    prepareThermalOutput() {
      const original = document.getElementById('thermal-slip-paper');
      const target = document.getElementById('receipt-print');
      if (!original || !target) return;

      const sheet = original.cloneNode(true);
      sheet.removeAttribute('id');
      sheet.removeAttribute('hidden');
      sheet.classList.add('thermal-slip-export');

      target.replaceChildren(sheet);
      document.body.classList.remove('receipt-output', 'summary-output');
      document.body.classList.add('thermal-output');
    },

    clearThermalOutput() {
      document.body.classList.remove('thermal-output');
      const target = document.getElementById('receipt-print');
      if (target) target.replaceChildren();
    }
  };

  // Expose to window for app.js and tests
  window.HisaabThermal = HisaabThermal;
})();
