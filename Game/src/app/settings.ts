// M015 Settings: graphics quality (Auto / Low / Medium / High) and the
// performance monitor switch. Presentation only. A new quality applies after
// a reload (the page saves the settlement on the way out, as on any reload).
import { QUALITY_PRESETS, QUALITY_STORAGE_KEY, QualityChoice, QualityLevel } from './quality';

export interface SettingsOptions {
  current: { level: QualityLevel; source: 'url' | 'saved' | 'auto'; choice: QualityChoice; reasons: string[] };
  perfOn: boolean;
}

const describe = (l: QualityLevel) => {
  const p = QUALITY_PRESETS[l];
  return `pixel ratio up to ${p.pixelRatioCap}, ${p.antialias ? 'smoothing on' : 'no smoothing'}, ${p.shadows ? `shadows ${p.shadowMapSize} px` : 'no shadows'}, full-detail trees to ${p.natureNear} m, ground cover ${p.groundCoverRadius} m`;
};

export function mountSettings(o: SettingsOptions): void {
  const button = document.createElement('button');
  button.id = 'settings-button';
  button.type = 'button';
  button.setAttribute('aria-label', 'Settings: graphics quality and performance monitor');
  button.setAttribute('aria-expanded', 'false');
  // An inline icon: the gear character is missing from some Android and Linux fonts.
  button.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.5 7.5 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.5 7.5 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.5 7.5 0 0 0 1.7 1L11 21h4l.4-2.9a7.5 7.5 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>';
  const panel = document.createElement('section');
  panel.id = 'settings-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Settings');
  const opt = (v: QualityChoice, label: string, sub: string) => `<label class="q-opt"><input type="radio" name="astrix-quality" value="${v}" ${o.current.choice === v && o.current.source !== 'url' ? 'checked' : ''}><span><b>${label}</b><br><span class="dim">${sub}</span></span></label>`;
  const now = `Now: <b>${o.current.level}</b> (${o.current.source === 'url' ? 'set by ?quality= in the address' : o.current.source === 'saved' ? 'your choice' : `automatic: ${o.current.reasons.join(', ')}`})`;
  panel.innerHTML = `<header><h2>Settings</h2><button type="button" data-settings-close aria-label="Close settings">×</button></header>
    <h3>Graphics quality</h3>
    <p class="dim">${now}. Animals, people and buildings look the same at every level.</p>
    <form data-quality>
      ${opt('auto', 'Auto', 'chosen from this device: high on computers, medium on phones and tablets, low on weak ones')}
      ${opt('low', 'Low', describe('low'))}
      ${opt('medium', 'Medium', describe('medium'))}
      ${opt('high', 'High', describe('high'))}
    </form>
    <p class="dim">Changing it reloads the page (your world is saved first).</p>
    <h3>Performance monitor</h3>
    <p class="dim">Shows fps and frame time and records a report you can copy or download.</p>
    <button type="button" data-perf-toggle>${o.perfOn ? 'Turn the monitor off' : 'Turn the monitor on (?perf=1)'}</button>`;
  document.body.append(button, panel);
  const toggle = (open = panel.hidden) => { panel.hidden = !open; button.setAttribute('aria-expanded', String(open)); };
  button.addEventListener('click', () => toggle());
  panel.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-settings-close]')) toggle(false);
    if (t.closest('[data-perf-toggle]')) {
      const q = new URLSearchParams(location.search);
      if (o.perfOn) q.delete('perf'); else q.set('perf', '1');
      const s = q.toString();
      location.href = location.pathname + (s ? `?${s}` : '');
    }
  });
  panel.querySelector('form')!.addEventListener('change', (e) => {
    const v = (e.target as HTMLInputElement).value as QualityChoice;
    try { localStorage.setItem(QUALITY_STORAGE_KEY, v); } catch { /* private mode: the choice lasts for this load only */ }
    const q = new URLSearchParams(location.search);
    q.delete('quality');
    const s = q.toString();
    location.href = location.pathname + (s ? `?${s}` : '');
  });
}
