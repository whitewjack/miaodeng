(function(global) {
  function buildError(code, message) {
    var err = new Error(message);
    err.code = code;
    return err;
  }

  function isImageFile(file) {
    return !!(file && typeof file.type === 'string' && file.type.indexOf('image/') === 0);
  }

  function drawImageToCanvas(image, width, height) {
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width || image.width || image.naturalWidth || 1);
    canvas.height = Math.max(1, height || image.height || image.naturalHeight || 1);
    var ctx = canvas.getContext('2d');
    if (!ctx) {
      throw buildError('DECODE_FAILED', 'Cannot create canvas context');
    }
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function loadImageElementFromFile(file) {
    return new Promise(function(resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function() {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function() {
        URL.revokeObjectURL(url);
        reject(buildError('DECODE_FAILED', 'Failed to load image'));
      };
      img.src = url;
    });
  }

  async function readImageAsCanvas(file) {
    if (typeof createImageBitmap === 'function') {
      try {
        var bitmap = await createImageBitmap(file);
        try {
          return drawImageToCanvas(bitmap, bitmap.width, bitmap.height);
        } finally {
          if (bitmap && typeof bitmap.close === 'function') {
            bitmap.close();
          }
        }
      } catch (_) {
        // fall back to image element
      }
    }
    var image = await loadImageElementFromFile(file);
    return drawImageToCanvas(image, image.naturalWidth, image.naturalHeight);
  }

  async function detectByBarcodeDetector(canvas) {
    if (typeof global.BarcodeDetector !== 'function') return '';

    var detector;
    try {
      detector = new global.BarcodeDetector({ formats: ['qr_code'] });
    } catch (_) {
      detector = new global.BarcodeDetector();
    }

    var results = await detector.detect(canvas);
    if (!Array.isArray(results) || results.length === 0) return '';

    for (var i = 0; i < results.length; i += 1) {
      var rawValue = results[i] && results[i].rawValue;
      if (typeof rawValue === 'string' && rawValue.trim()) {
        return rawValue.trim();
      }
    }
    return '';
  }

  function detectByJsQr(canvas) {
    if (typeof global.jsQR !== 'function') return '';
    var ctx = canvas.getContext('2d');
    if (!ctx) return '';
    var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var result = global.jsQR(imageData.data, canvas.width, canvas.height, {
      inversionAttempts: 'attemptBoth'
    });
    if (result && typeof result.data === 'string' && result.data.trim()) {
      return result.data.trim();
    }
    return '';
  }

  async function decodeQrTextFromImageFile(file) {
    if (!file) throw buildError('INVALID_FILE', 'File is required');
    if (!isImageFile(file)) throw buildError('INVALID_FILE', 'File must be an image');

    var canUseBarcodeDetector = typeof global.BarcodeDetector === 'function';
    var canUseJsQr = typeof global.jsQR === 'function';
    if (!canUseBarcodeDetector && !canUseJsQr) {
      throw buildError('UNSUPPORTED', 'No QR decoder available');
    }

    var canvas = await readImageAsCanvas(file);
    var payload = '';
    var detectorError = null;

    if (canUseBarcodeDetector) {
      try {
        payload = await detectByBarcodeDetector(canvas);
      } catch (err) {
        detectorError = err || null;
        payload = '';
      }
    }

    if (!payload && canUseJsQr) {
      try {
        payload = detectByJsQr(canvas);
      } catch (_) {
        payload = '';
      }
    }

    if (!payload) {
      if (!canUseJsQr && detectorError) {
        throw buildError('UNSUPPORTED', 'BarcodeDetector failed');
      }
      throw buildError('NO_QR', 'No QR code found in image');
    }

    return payload;
  }

  global.decodeQrTextFromImageFile = decodeQrTextFromImageFile;
})(window);
