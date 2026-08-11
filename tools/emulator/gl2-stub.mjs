// A WebGL2 context that satisfies three.js without a GPU.
//
// headless-gl only offers WebGL 1.0 and three r163+ dropped WebGL1 entirely, so
// there is no real context to be had here. This stub does not draw anything —
// it exists so `new THREE.WebGLRenderer()` succeeds and the whole game above it
// can be booted, stepped and driven. Every call is recorded, so the emulator can
// still report draw calls, program count and texture uploads.
//
// What this CANNOT catch: shader compile errors, anything about pixels. What it
// CAN catch: every logic bug in a 35,000-line game, which is the point.

const F = () => { };

export function createGL2Stub(width = 1600, height = 900) {
  const stats = { calls: 0, draws: 0, programs: 0, textures: 0, buffers: 0, errors: [] };
  let idc = 1;
  const obj = (kind) => ({ __kind: kind, __id: idc++ });

  const PARAMS = {
    VERSION: 'WebGL 2.0 (emulator)',
    SHADING_LANGUAGE_VERSION: 'WebGL GLSL ES 3.00',
    VENDOR: 'hide-and-seek emulator',
    RENDERER: 'stub',
    MAX_TEXTURE_SIZE: 16384,
    MAX_CUBE_MAP_TEXTURE_SIZE: 16384,
    MAX_TEXTURE_IMAGE_UNITS: 16,
    MAX_VERTEX_TEXTURE_IMAGE_UNITS: 16,
    MAX_COMBINED_TEXTURE_IMAGE_UNITS: 32,
    MAX_VERTEX_ATTRIBS: 16,
    MAX_VERTEX_UNIFORM_VECTORS: 1024,
    MAX_FRAGMENT_UNIFORM_VECTORS: 1024,
    MAX_VARYING_VECTORS: 30,
    MAX_SAMPLES: 4,
    MAX_ARRAY_TEXTURE_LAYERS: 256,
    MAX_3D_TEXTURE_SIZE: 2048,
    MAX_DRAW_BUFFERS: 8,
    MAX_COLOR_ATTACHMENTS: 8,
    MAX_RENDERBUFFER_SIZE: 16384,
    MAX_VIEWPORT_DIMS: new Int32Array([16384, 16384]),
    SCISSOR_BOX: new Int32Array([0, 0, width, height]),
    VIEWPORT: new Int32Array([0, 0, width, height]),
    ALIASED_LINE_WIDTH_RANGE: new Float32Array([1, 1]),
    MAX_ANISOTROPY_EXT: 16,
    MAX_TEXTURE_MAX_ANISOTROPY_EXT: 16,
  };

  const gl = new Proxy({
    canvas: null,
    drawingBufferWidth: width,
    drawingBufferHeight: height,
    __stats: stats,

    getParameter(p) {
      stats.calls++;
      if (typeof p === 'string' && p in PARAMS) return PARAMS[p];
      const name = NAMES.get(p);
      if (name && name in PARAMS) return PARAMS[name];
      // Numeric limits three probes for; generous defaults are safe.
      return 16384;
    },
    getExtension(name) {
      stats.calls++;
      // Advertise the ones three actually wants, refuse the rest so it takes
      // its documented fallbacks rather than calling into nothing.
      const yes = [
        'EXT_texture_filter_anisotropic', 'WEBGL_debug_renderer_info',
        'OES_texture_float_linear', 'EXT_color_buffer_float',
        'EXT_color_buffer_half_float',
        'KHR_parallel_shader_compile',
        // NOT WEBGL_multisampled_render_to_texture: three calls real methods on
        // it, and advertising an extension we cannot implement is worse than
        // refusing it — three has a documented fallback for its absence.
      ];
      if (!yes.includes(name)) return null;
      if (name === 'EXT_texture_filter_anisotropic') {
        return { MAX_TEXTURE_MAX_ANISOTROPY_EXT: 0x84FF, TEXTURE_MAX_ANISOTROPY_EXT: 0x84FE };
      }
      if (name === 'WEBGL_debug_renderer_info') {
        return { UNMASKED_VENDOR_WEBGL: 0x9245, UNMASKED_RENDERER_WEBGL: 0x9246 };
      }
      if (name === 'KHR_parallel_shader_compile') return { COMPLETION_STATUS_KHR: 0x91B1 };
      return {};
    },
    getSupportedExtensions: () => ['EXT_texture_filter_anisotropic', 'EXT_color_buffer_float'],
    getContextAttributes: () => ({ alpha: false, antialias: false, depth: true, stencil: false }),
    isContextLost: () => false,

    createShader: () => obj('shader'),
    createProgram: () => { stats.programs++; return obj('program'); },
    createTexture: () => { stats.textures++; return obj('texture'); },
    createBuffer: () => { stats.buffers++; return obj('buffer'); },
    createFramebuffer: () => obj('framebuffer'),
    createRenderbuffer: () => obj('renderbuffer'),
    createVertexArray: () => obj('vao'),
    createSampler: () => obj('sampler'),
    createQuery: () => obj('query'),
    createTransformFeedback: () => obj('tf'),

    // Everything three checks the result of has to answer optimistically.
    getShaderParameter: () => true,
    getProgramParameter: (p, k) => (k === 0x8B86 /* ACTIVE_UNIFORMS */ || k === 0x8B89 ? 0 : true),
    getShaderInfoLog: () => '',
    getProgramInfoLog: () => '',
    getShaderPrecisionFormat: () => ({ rangeMin: 127, rangeMax: 127, precision: 23 }),
    getUniformLocation: () => obj('uniform'),
    getAttribLocation: () => 0,
    getActiveUniform: () => ({ name: 'u', size: 1, type: 0x1406 }),
    getActiveAttrib: () => ({ name: 'a', size: 1, type: 0x1406 }),
    getError: () => 0,
    checkFramebufferStatus: () => 0x8CD5, // FRAMEBUFFER_COMPLETE
    getQueryParameter: () => true,
    fenceSync: () => obj('sync'),
    clientWaitSync: () => 0x911A,          // ALREADY_SIGNALED
    getBufferSubData: F,
    readPixels: F,

    drawArrays() { stats.calls++; stats.draws++; },
    drawElements() { stats.calls++; stats.draws++; },
    drawArraysInstanced() { stats.calls++; stats.draws++; },
    drawElementsInstanced() { stats.calls++; stats.draws++; },
  }, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (typeof prop === 'symbol') return undefined;
      // Enum constants: three compares them, never dereferences them.
      if (/^[A-Z0-9_]+$/.test(prop)) {
        if (!ENUMS.has(prop)) { ENUMS.set(prop, nextEnum++); NAMES.set(ENUMS.get(prop), prop); }
        return ENUMS.get(prop);
      }
      // Any other method: count it and do nothing.
      return (...a) => { stats.calls++; return undefined; };
    },
    has: () => true,
  });

  return gl;
}

const ENUMS = new Map();
const NAMES = new Map();
let nextEnum = 0x1000;
