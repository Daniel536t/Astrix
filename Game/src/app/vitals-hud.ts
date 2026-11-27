// Presentation of the character's vitals: health, stamina and breath, a
// damage vignette, an underwater tint and the death screen. Reads the
// simulation state only; never changes it.
import { MAX_HEALTH, type CharacterState } from '../sim/character';
import { RESPAWN_DELAY } from './explore';

const BUBBLES = 10;

export class VitalsHud {
  private readonly root = document.createElement('div');
  private readonly health: HTMLElement;
  private readonly healthFill: HTMLElement;
  private readonly stamina: HTMLElement;
  private readonly staminaFill: HTMLElement;
  private readonly breath: HTMLElement;
  private readonly bubbles: HTMLElement[] = [];
  private readonly vignette = document.createElement('div');
  private readonly tint = document.createElement('div');
  private readonly death = document.createElement('div');
  private hurtGlow = 0;
  private deadSince = 0;
  private key = '';

  constructor() {
    this.root.id = 'vitals';
    this.root.setAttribute('aria-label', 'Health, stamina and breath');
    this.root.innerHTML = `
      <div class="vital health" role="meter" aria-label="Health" aria-valuemin="0" aria-valuemax="${MAX_HEALTH}"><svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 14.5 1.6 8.3A3.9 3.9 0 0 1 8 3.4a3.9 3.9 0 0 1 6.4 4.9z"/></svg><div class="bar"><i></i></div></div>
      <div class="vital stamina" role="meter" aria-label="Stamina" aria-valuemin="0" aria-valuemax="100"><svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M9.5 1 3 9h4l-1 6 6.5-8h-4z"/></svg><div class="bar"><i></i></div></div>
      <div class="vital breath" role="meter" aria-label="Breath" aria-valuemin="0" aria-valuemax="${BUBBLES}"><svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="6" cy="6" r="1.3" fill="currentColor"/></svg><div class="bubbles"></div></div>`;
    this.health = this.root.querySelector('.health')!;
    this.healthFill = this.health.querySelector('i')!;
    this.stamina = this.root.querySelector('.stamina')!;
    this.staminaFill = this.stamina.querySelector('i')!;
    this.breath = this.root.querySelector('.breath')!;
    const holder = this.breath.querySelector('.bubbles')!;
    for (let i = 0; i < BUBBLES; i++) {
      const b = document.createElement('span');
      b.className = 'bubble';
      holder.appendChild(b);
      this.bubbles.push(b);
    }
    this.vignette.id = 'hurt-vignette';
    this.tint.id = 'underwater-tint';
    this.death.id = 'death-screen';
    this.death.setAttribute('role', 'alert');
    document.body.append(this.tint, this.vignette, this.root, this.death);
  }

  /** Call every frame; `s` is null when not walking. */
  update(s: CharacterState | null, frameDt: number): void {
    const show = !!s;
    this.root.classList.toggle('visible', show);
    if (!s) { this.vignette.style.opacity = '0'; this.tint.style.opacity = '0'; this.death.classList.remove('visible'); return; }

    if (s.hurt > 0) this.hurtGlow = Math.min(1, this.hurtGlow + 0.5);
    this.hurtGlow = Math.max(0, this.hurtGlow - frameDt * 1.6);
    const low = 1 - s.health / MAX_HEALTH;
    this.vignette.style.opacity = String(Math.min(0.85, this.hurtGlow * 0.7 + (s.health < 35 ? low * 0.35 : 0)));
    this.tint.style.opacity = s.headUnderwater ? '1' : '0';

    const swimming = s.mode === 'swim';
    document.body.classList.toggle('swimming', swimming && !s.dead);
    document.body.classList.toggle('underwater', s.headUnderwater);

    const bubbles = Math.ceil(s.breath * BUBBLES - 1e-6);
    const key = [Math.round(s.health), Math.round(s.stamina * 100), bubbles, swimming, s.headUnderwater, s.dead].join('|');
    if (key !== this.key) {
      this.key = key;
      this.healthFill.style.width = `${(s.health / MAX_HEALTH) * 100}%`;
      this.health.classList.toggle('low', s.health < 35);
      this.health.setAttribute('aria-valuenow', String(Math.round(s.health)));
      this.staminaFill.style.width = `${s.stamina * 100}%`;
      this.stamina.classList.toggle('visible', swimming || s.stamina < 0.999);
      this.stamina.classList.toggle('empty', s.stamina <= 0);
      this.stamina.setAttribute('aria-valuenow', String(Math.round(s.stamina * 100)));
      this.breath.classList.toggle('visible', s.headUnderwater || s.breath < 0.999);
      this.breath.setAttribute('aria-valuenow', String(bubbles));
      this.bubbles.forEach((b, i) => b.classList.toggle('gone', i >= bubbles));
    }

    if (s.dead) {
      if (!this.deadSince) this.deadSince = performance.now();
      const left = Math.max(0, RESPAWN_DELAY - (performance.now() - this.deadSince) / 1000);
      this.death.innerHTML = `<strong>${s.cause === 'drowned' ? 'You drowned' : 'You died'}</strong><span>Respawning on dry land in ${Math.ceil(left)}…</span>`;
      this.death.classList.add('visible');
    } else if (this.deadSince) {
      this.deadSince = 0;
      this.death.classList.remove('visible');
    }
  }
}
