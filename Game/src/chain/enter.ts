// First-visit entry screen: the two permanent ways into the same game.
//   Quick Play   world owned by a key made in this browser (upgrade later).
//   Wallet Play  world owned by an external wallet from the start.
// Plus recovery for players who already own a world, and offline exploring.
// Shown once per browser (until a world exists); ?enter=1 shows it again.
// W1: the screen also lists the browser's local worlds (settlement and wilderness).
import type { DetectedWallet } from './identity';
import { WorldListState, openWorld, worldListHtml } from '../app/worlds';

const SEEN = 'astrix:entered:v1';

export interface EnterOptions {
  wallets: () => DetectedWallet[];
  passkey: boolean;
  choose: (act: string) => Promise<void>;
  /** W1: the local world list ("Continue settlement", "New wilderness", "Continue wilderness"). */
  worlds?: WorldListState;
}

export function showEnterScreen(o: EnterOptions): { status: (m: string) => void } | null {
  const force = new URLSearchParams(location.search).get('enter') === '1';
  if (!force && localStorage.getItem(SEEN)) return null;
  const el = document.createElement('div');
  el.id = 'enter-screen';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Enter ASTrix');
  const wallets = o.wallets();
  const walletBtns = wallets.length
    ? wallets.map((w, i) => `<button data-act="wallet:${i}" class="primary">Connect ${w.name}</button>`).join('')
    : '<button disabled>No wallet found</button><div class="hint">Install Phantom or Backpack, then reload.</div>';
  el.innerHTML = `<div class="enter-card">
    <h1>ASTrix</h1>
    <p class="lead">Explore the guided <b>Founder’s Settlement (Demo)</b>, start fresh in a <b>New Wilderness</b>, or claim your own world recorded on MagicBlock and Solana.</p>
    ${o.worlds ? worldListHtml(o.worlds) : ''}
    <div class="enter-options">
      <section>
        <h2>Quick Play</h2>
        <p>Start now. No wallet, no SOL, no sign-up. Protect the world with a passkey or move it to a wallet later. You keep the same world.</p>
        <button data-act="create" class="primary">Quick Play</button>
      </section>
      <section>
        <h2>Wallet Play</h2>
        <p>Your wallet owns the world. Approve once; this browser then plays with a limited session key, with no pop-up per action.</p>
        ${walletBtns}
      </section>
    </div>
    <div class="enter-secondary">
      <span>Already have a world?</span>
      ${o.passkey ? '<button data-act="recover-passkey">Recover with passkey</button>' : ''}
      ${wallets.map((w, i) => `<button data-act="recover-wallet:${i}">Recover with ${w.name}</button>`).join('')}
      <button data-act="offline">Explore offline</button>
    </div>
    <div class="enter-status" aria-live="polite"></div>
  </div>`;
  document.body.appendChild(el);
  const statusEl = el.querySelector('.enter-status') as HTMLElement;
  const buttons = () => Array.from(el.querySelectorAll('button[data-act]')) as HTMLButtonElement[];
  const close = () => { localStorage.setItem(SEEN, String(Date.now())); el.remove(); };
  el.addEventListener('click', async (e) => {
    const world = (e.target as HTMLElement).closest('button')?.getAttribute('data-world');
    // A local world: open it (reload), or close the screen when it is already open.
    if (world && o.worlds) { if (!openWorld(world, o.worlds)) close(); return; }
    const act = (e.target as HTMLElement).closest('button')?.getAttribute('data-act');
    if (!act) return;
    if (act === 'offline') { close(); return; }
    buttons().forEach((b) => (b.disabled = true));
    await o.choose(act);
    // Success reloads into the new world; reaching here with the dialog open means
    // the attempt failed or was cancelled, so let the player choose again.
    buttons().forEach((b) => (b.disabled = false));
  });
  return {
    status: (m: string) => {
      statusEl.textContent = m;
      if (/ready|loading your terrain/.test(m)) localStorage.setItem(SEEN, String(Date.now()));
    },
  };
}
