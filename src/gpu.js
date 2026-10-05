// WebGL2 renderer: the same inverse walk as render.js, one fragment per
// sample, with the strokes read from a float texture (see pack.js).

import { TRAY } from './marble.js';
import { packOps, OPS_PER_ROW, TEXELS_PER_OP } from './pack.js';
import { parseColor } from './render.js';

const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D uOps;
uniform int uCount;
uniform vec3 uBath;
uniform float uScale;   // tray units per pixel
uniform float uHeight;  // canvas height in pixels
uniform int uSS;
out vec4 outColor;

vec4 slot(int i, int t) {
  int row = i / ${OPS_PER_ROW};
  int col = (i - row * ${OPS_PER_ROW}) * ${TEXELS_PER_OP} + t;
  return texelFetch(uOps, ivec2(col, row), 0);
}

vec3 inkAt(vec2 p) {
  for (int i = uCount - 1; i >= 0; i--) {
    vec4 a = slot(i, 0);
    int kind = int(a.x + 0.5);
    vec2 c = a.yz;
    if (kind == 0) {
      vec2 d = p - c;
      float d2 = dot(d, d);
      if (d2 <= a.w) return slot(i, 1).xyz;
      p = c + d * sqrt(1.0 - a.w / d2);
    } else if (kind == 1) {
      vec4 b = slot(i, 1);
      vec4 e = slot(i, 2);
      vec2 m = vec2(a.w, b.x);
      float n = -(p.x - c.x) * m.y + (p.y - c.y) * m.x;
      int tines = int(e.y + 0.5);
      float s = 0.0;
      for (int j = 0; j < tines; j++) s += exp(abs(n - b.w - float(j) * e.x) * b.z);
      p -= s * b.y * m;
    } else if (kind == 2) {
      vec4 b = slot(i, 1);
      vec2 d = p - c;
      float rho = length(d);
      if (rho > 0.0) {
        float ang = -b.x * exp(abs(rho - a.w) * b.y) / rho;
        float ca = cos(ang);
        float sa = sin(ang);
        p = c + vec2(d.x * ca - d.y * sa, d.x * sa + d.y * ca);
      }
    } else {
      vec4 b = slot(i, 1);
      vec2 m = vec2(a.w, b.x);
      float t = dot(p - c, m);
      float s = -b.y * sin(b.z * t + b.w);
      p += s * vec2(-m.y, m.x);
    }
  }
  return uBath;
}

void main() {
  vec2 px = vec2(gl_FragCoord.x - 0.5, uHeight - gl_FragCoord.y - 0.5);
  vec3 sum = vec3(0.0);
  float ss = float(uSS);
  for (int j = 0; j < uSS; j++) {
    for (int i = 0; i < uSS; i++) {
      vec2 q = px + (vec2(float(i), float(j)) + 0.5) / ss;
      sum += inkAt(q * uScale);
    }
  }
  outColor = vec4(sum / (ss * ss), 1.0);
}`;

function shader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(log || 'shader failed to compile');
  }
  return s;
}

// A renderer on its own canvas, or null where WebGL2 is unavailable.
export function createGpuRenderer() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, alpha: false });
  if (!gl) return null;
  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, shader(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, shader(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  } catch {
    return null;
  }
  const u = {};
  for (const name of ['uOps', 'uCount', 'uBath', 'uScale', 'uHeight', 'uSS']) u[name] = gl.getUniformLocation(program, name);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const vao = gl.createVertexArray();
  const maxSize = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), ...gl.getParameter(gl.MAX_VIEWPORT_DIMS));
  let count = 0;

  return {
    canvas,
    maxSize,
    isLost: () => gl.isContextLost(),

    setOps(ops) {
      const packed = packOps(ops);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, packed.width, packed.rows, 0, gl.RGBA, gl.FLOAT, packed.data);
      count = packed.count;
    },

    // Draw the whole tray at size x size pixels, in horizontal bands of
    // `band` rows so one long frame does not stall the graphics driver.
    draw(size, bath, ss = 1, band = size) {
      if (canvas.width !== size) {
        canvas.width = size;
        canvas.height = size;
      }
      gl.viewport(0, 0, size, size);
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(u.uOps, 0);
      gl.uniform1i(u.uCount, count);
      gl.uniform3fv(u.uBath, parseColor(bath).map((v) => v / 255));
      gl.uniform1f(u.uScale, TRAY / size);
      gl.uniform1f(u.uHeight, size);
      gl.uniform1i(u.uSS, ss);
      gl.enable(gl.SCISSOR_TEST);
      for (let y = 0; y < size; y += band) {
        gl.scissor(0, y, size, Math.min(band, size - y));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        if (band < size) gl.flush();
      }
      gl.disable(gl.SCISSOR_TEST);
    },

    // Block until drawing is done; returns RGBA of one pixel (for timing).
    finish() {
      const px = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return px;
    },

    // RGBA rows top to bottom, for checks against the CPU renderer.
    read() {
      const w = canvas.width;
      const raw = new Uint8Array(w * w * 4);
      gl.readPixels(0, 0, w, w, gl.RGBA, gl.UNSIGNED_BYTE, raw);
      const out = new Uint8ClampedArray(raw.length);
      for (let y = 0; y < w; y++) out.set(raw.subarray((w - 1 - y) * w * 4, (w - y) * w * 4), y * w * 4);
      return out;
    },
  };
}
