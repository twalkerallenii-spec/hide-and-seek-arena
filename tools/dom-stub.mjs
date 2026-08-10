// Minimal DOM/Canvas2D shim so the engine's procedural texture foundry and the
// arena build code can run under Node with no browser.
//
// It implements the handful of Canvas2D calls that actually move pixels
// (create/put/getImageData) for real, and answers everything else with a
// forgiving no-op so arbitrary decal-painting code doesn't crash.

class ImageDataShim {
  constructor(w, h) {
    this.width = w; this.height = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }
}

const NOOP_RETURNS = {
  createLinearGradient: () => ({ addColorStop() { } }),
  createRadialGradient: () => ({ addColorStop() { } }),
  createConicGradient: () => ({ addColorStop() { } }),
  createPattern: () => null,
  measureText: (t) => ({ width: String(t).length * 18, actualBoundingBoxAscent: 24, actualBoundingBoxDescent: 6 }),
  getLineDash: () => [],
  isPointInPath: () => false,
};

function makeContext2D(canvas) {
  let stored = null;
  const base = {
    canvas,
    createImageData(w, h) {
      if (typeof w === 'object') return new ImageDataShim(w.width, w.height);
      return new ImageDataShim(w, h ?? w);
    },
    putImageData(img) { stored = img; },
    getImageData(x, y, w, h) {
      if (stored && stored.width === w && stored.height === h) return stored;
      return new ImageDataShim(w, h);
    },
    drawImage() { },
  };
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop in NOOP_RETURNS) return NOOP_RETURNS[prop];
      if (typeof prop === 'symbol') return undefined;
      return () => { };
    },
    set(target, prop, value) { target[prop] = value; return true; },
    has() { return true; },
  });
}

class CanvasShim {
  constructor() {
    this.width = 300; this.height = 150;
    this.style = {};
    this._ctx2d = null;
    this.nodeName = 'CANVAS';
  }
  getContext(kind) {
    if (kind === '2d') return (this._ctx2d ||= makeContext2D(this));
    return null;   // no WebGL under Node
  }
  toDataURL() { return 'data:image/png;base64,'; }
  addEventListener() { }
  removeEventListener() { }
  appendChild() { }
}

class ElementShim {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.style = {};
    this.children = [];
    this.dataset = {};
    this.classList = { add() { }, remove() { }, toggle() { }, contains: () => false };
  }
  appendChild(c) { this.children.push(c); return c; }
  removeChild() { }
  setAttribute() { }
  getAttribute() { return null; }
  addEventListener() { }
  removeEventListener() { }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  get textContent() { return this._t || ''; }
  set textContent(v) { this._t = v; }
  get innerHTML() { return this._h || ''; }
  set innerHTML(v) { this._h = v; }
}

export function installDOM() {
  if (globalThis.document) return;

  const documentShim = {
    createElement(tag) {
      return String(tag).toLowerCase() === 'canvas' ? new CanvasShim() : new ElementShim(tag);
    },
    createElementNS(_ns, tag) { return documentShim.createElement(tag); },
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() { },
    removeEventListener() { },
    body: new ElementShim('body'),
    documentElement: new ElementShim('html'),
    pointerLockElement: null,
  };

  const windowShim = {
    innerWidth: 1600,
    innerHeight: 900,
    devicePixelRatio: 1,
    addEventListener() { },
    removeEventListener() { },
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    AudioContext: undefined,
    location: { href: 'http://localhost/', search: '' },
  };

  globalThis.document = documentShim;
  globalThis.window = windowShim;
  globalThis.self = globalThis;
  globalThis.ImageData = ImageDataShim;
  globalThis.HTMLCanvasElement = CanvasShim;
  globalThis.HTMLElement = ElementShim;
  globalThis.navigator ??= { userAgent: 'node' };
  globalThis.localStorage ??= {
    _m: new Map(),
    getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
    setItem(k, v) { this._m.set(k, String(v)); },
    removeItem(k) { this._m.delete(k); },
  };
  globalThis.requestAnimationFrame ??= windowShim.requestAnimationFrame;
  globalThis.cancelAnimationFrame ??= windowShim.cancelAnimationFrame;
  globalThis.addEventListener ??= () => { };
  globalThis.removeEventListener ??= () => { };
}
