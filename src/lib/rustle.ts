// Synthesised page-rustle: a short band-passed noise sweep (no audio files needed).
let ac: AudioContext | null = null;

/** volume: 0 (silent) … 1 (full). */
export function playRustle(volume = 0.4) {
  if (volume <= 0) return;
  try {
    ac ??= new AudioContext();
    const dur = 0.42;
    const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(Math.sin(Math.PI * t), 1.6) * (0.6 + 0.4 * Math.random());
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(3200, ac.currentTime);
    bp.frequency.exponentialRampToValueAtTime(900, ac.currentTime + dur);
    const g = ac.createGain();
    g.gain.value = 0.22 * Math.min(1, volume);
    src.connect(bp).connect(g).connect(ac.destination);
    src.start();
  } catch {
    /* audio unavailable */
  }
}
