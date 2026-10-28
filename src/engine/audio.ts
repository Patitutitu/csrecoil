import type { HitGrade } from './types'

/**
 * Metrónomo y efectos con Web Audio. Todo se agenda sobre el reloj del AudioContext
 * (nunca con setTimeout) para que cada tick caiga exactamente en la cadencia real del arma.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  private scheduled: AudioScheduledSourceNode[] = []

  enabled = true
  beat = true
  volume = 0.6

  get available(): boolean {
    return typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window)
  }

  /** Debe llamarse desde un gesto del usuario para que el navegador permita reproducir. */
  ensure(): AudioContext | null {
    if (!this.available) return null
    if (!this.ctx) {
      const Ctor = (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) as typeof AudioContext
      this.ctx = new Ctor({ latencyHint: 'interactive' })
      this.master = this.ctx.createGain()
      this.master.gain.value = this.volume
      this.master.connect(this.ctx.destination)
      const len = this.ctx.sampleRate
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
      const data = this.noiseBuffer.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  setVolume(v: number): void {
    this.volume = v
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01)
  }

  /** Convierte un instante de performance.now() al reloj del AudioContext. */
  private toAudioTime(ctx: AudioContext, perfMs: number): number {
    return ctx.currentTime + (perfMs - performance.now()) / 1000
  }

  /**
   * Agenda un tick por bala desde perfT0, cada cycleMs. Si `beat` está activo agrega
   * un bombo cada 4 balas (cada bala es una semicorchea del tempo derivado del arma).
   */
  scheduleBurst(perfT0: number, cycleMs: number, bullets: number): void {
    if (!this.enabled) return
    const ctx = this.ensure()
    if (!ctx) return
    this.cancelScheduled()
    const base = this.toAudioTime(ctx, perfT0)
    for (let i = 0; i < bullets; i++) {
      const when = Math.max(ctx.currentTime, base + (i * cycleMs) / 1000)
      const accent = i % 4 === 0
      this.tick(ctx, when, accent)
      if (this.beat && accent) this.kick(ctx, when)
    }
  }

  /** Reproduce la cadencia del arma sin jugar, para escucharla antes de practicar. */
  preview(cycleMs: number, bullets: number): void {
    const ctx = this.ensure()
    if (!ctx) return
    this.scheduleBurst(performance.now() + 60, cycleMs, bullets)
  }

  cancelScheduled(): void {
    for (const node of this.scheduled) {
      try {
        node.stop()
      } catch {
        // ya detenido
      }
    }
    this.scheduled = []
  }

  playJudgment(grade: HitGrade): void {
    if (!this.enabled) return
    const ctx = this.ensure()
    if (!ctx) return
    const now = ctx.currentTime
    switch (grade) {
      case 'perfect':
        this.tone(ctx, now, 1320, 0.12, 'sine', 0.22)
        this.tone(ctx, now + 0.03, 1980, 0.14, 'sine', 0.14)
        break
      case 'great':
        this.tone(ctx, now, 990, 0.1, 'sine', 0.2)
        break
      case 'good':
        this.tone(ctx, now, 560, 0.09, 'triangle', 0.18)
        break
      case 'miss':
        this.thud(ctx, now)
        break
    }
  }

  playStart(): void {
    if (!this.enabled) return
    const ctx = this.ensure()
    if (!ctx) return
    this.tone(ctx, ctx.currentTime, 440, 0.08, 'square', 0.08)
  }

  playFinish(good: boolean): void {
    if (!this.enabled) return
    const ctx = this.ensure()
    if (!ctx) return
    const now = ctx.currentTime + 0.05
    if (good) {
      this.tone(ctx, now, 660, 0.12, 'sine', 0.18)
      this.tone(ctx, now + 0.1, 880, 0.12, 'sine', 0.18)
      this.tone(ctx, now + 0.2, 1320, 0.25, 'sine', 0.18)
    } else {
      this.tone(ctx, now, 330, 0.18, 'triangle', 0.16)
      this.tone(ctx, now + 0.15, 247, 0.3, 'triangle', 0.16)
    }
  }

  private out(): AudioNode {
    return this.master as AudioNode
  }

  private tick(ctx: AudioContext, when: number, accent: boolean): void {
    if (!this.noiseBuffer) return
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = accent ? 4000 : 7000
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, when)
    g.gain.linearRampToValueAtTime(accent ? 0.5 : 0.3, when + 0.002)
    g.gain.exponentialRampToValueAtTime(0.001, when + (accent ? 0.06 : 0.035))
    src.connect(hp).connect(g).connect(this.out())
    src.start(when)
    src.stop(when + 0.08)
    this.scheduled.push(src)
    if (accent) {
      this.tone(ctx, when, 2200, 0.03, 'square', 0.06, true)
    }
  }

  private kick(ctx: AudioContext, when: number): void {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(150, when)
    osc.frequency.exponentialRampToValueAtTime(42, when + 0.11)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.55, when)
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.16)
    osc.connect(g).connect(this.out())
    osc.start(when)
    osc.stop(when + 0.18)
    this.scheduled.push(osc)
  }

  private tone(
    ctx: AudioContext,
    when: number,
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    track = false,
  ): void {
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.value = freq
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, when)
    g.gain.linearRampToValueAtTime(gain, when + 0.004)
    g.gain.exponentialRampToValueAtTime(0.001, when + dur)
    osc.connect(g).connect(this.out())
    osc.start(when)
    osc.stop(when + dur + 0.02)
    if (track) this.scheduled.push(osc)
  }

  private thud(ctx: AudioContext, when: number): void {
    if (!this.noiseBuffer) return
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 500
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.35, when)
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.12)
    src.connect(lp).connect(g).connect(this.out())
    src.start(when)
    src.stop(when + 0.14)
    this.tone(ctx, when, 110, 0.14, 'sawtooth', 0.1)
  }
}

export const audioEngine = new AudioEngine()
