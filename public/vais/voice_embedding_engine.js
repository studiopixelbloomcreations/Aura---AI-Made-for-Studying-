(function (global) {
  "use strict";

  const SAMPLE_RATE = 16000;
  const FRAME_SIZE = 400;
  const HOP = 160;
  const FILTERS = 26;
  const COEFFS = 13;

  function hzToMel(hz) { return 2595 * Math.log10(1 + hz / 700); }
  function melToHz(mel) { return 700 * (Math.pow(10, mel / 2595) - 1); }

  function fftPower(frame) {
    const n = 512;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    real.set(frame.slice(0, Math.min(frame.length, n)));
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = Math.PI * 2 / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0; j < half; j++) {
          const k = i + j;
          const l = k + half;
          const cos = Math.cos(-step * j);
          const sin = Math.sin(-step * j);
          const tre = real[l] * cos - imag[l] * sin;
          const tim = real[l] * sin + imag[l] * cos;
          real[l] = real[k] - tre; imag[l] = imag[k] - tim;
          real[k] += tre; imag[k] += tim;
        }
      }
    }
    const power = new Float32Array(n / 2 + 1);
    for (let i = 0; i < power.length; i++) power[i] = (real[i] * real[i] + imag[i] * imag[i]) / n;
    return power;
  }

  function filterBank(power) {
    const minMel = hzToMel(0);
    const maxMel = hzToMel(8000);
    const melPoints = Array.from({ length: FILTERS + 2 }, (_, i) => minMel + (i / (FILTERS + 1)) * (maxMel - minMel));
    const bins = melPoints.map((m) => Math.floor((512 + 1) * melToHz(m) / SAMPLE_RATE));
    const out = new Float32Array(FILTERS);
    for (let m = 1; m <= FILTERS; m++) {
      let energy = 0;
      for (let k = bins[m - 1]; k < bins[m]; k++) energy += (power[k] || 0) * ((k - bins[m - 1]) / Math.max(1, bins[m] - bins[m - 1]));
      for (let k = bins[m]; k < bins[m + 1]; k++) energy += (power[k] || 0) * ((bins[m + 1] - k) / Math.max(1, bins[m + 1] - bins[m]));
      out[m - 1] = Math.log(Math.max(energy, 1e-10));
    }
    return out;
  }

  function dct(values) {
    const out = new Float32Array(COEFFS);
    for (let k = 0; k < COEFFS; k++) {
      let sum = 0;
      for (let n = 0; n < values.length; n++) sum += values[n] * Math.cos(Math.PI * k * (n + 0.5) / values.length);
      out[k] = sum;
    }
    return out;
  }

  async function generateEmbedding(input) {
    const x = input instanceof Float32Array ? input : new Float32Array(input || []);
    if (x.length < SAMPLE_RATE * 0.5) throw new Error("Voice sample is too short.");
    const emphasized = new Float32Array(x.length);
    emphasized[0] = x[0];
    for (let i = 1; i < x.length; i++) emphasized[i] = x[i] - 0.97 * x[i - 1];
    const frames = [];
    for (let start = 0; start + FRAME_SIZE <= emphasized.length; start += HOP) {
      const frame = emphasized.slice(start, start + FRAME_SIZE);
      for (let n = 0; n < frame.length; n++) frame[n] *= 0.54 - 0.46 * Math.cos(2 * Math.PI * n / (frame.length - 1));
      frames.push(dct(filterBank(fftPower(frame))));
    }
    if (!frames.length) throw new Error("No usable voice frames were found.");
    const mean = new Float32Array(COEFFS);
    const variance = new Float32Array(COEFFS);
    frames.forEach((frame) => frame.forEach((v, i) => { mean[i] += v; }));
    for (let i = 0; i < COEFFS; i++) mean[i] /= frames.length;
    frames.forEach((frame) => frame.forEach((v, i) => { variance[i] += Math.pow(v - mean[i], 2); }));
    for (let i = 0; i < COEFFS; i++) variance[i] /= frames.length;
    const out = new Float32Array(COEFFS * 2);
    out.set(mean, 0); out.set(variance, COEFFS);
    return out;
  }

  global.AevraVoiceEmbeddingEngine = { generateEmbedding };
})(window);
