import assert from 'node:assert/strict';
import test from 'node:test';
import { OrbitRig } from '../src/render/camera';

test('programmatic camera views synchronously use the requested orbit target', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: { addEventListener() {} }, configurable: true });
  const testElement = {
    clientWidth: 1440,
    clientHeight: 1000,
    addEventListener() {},
  } as unknown as HTMLCanvasElement;
  try {
    const rig = new OrbitRig(testElement);
    rig.setView(38, 20, 22, -58.5, 14.2, -38.5);
    assert.ok(Math.abs(rig.camera.position.x - (-58.5 + 22 * Math.cos(20 * Math.PI / 180) * Math.sin(38 * Math.PI / 180))) < 1e-9);
    assert.ok(Math.abs(rig.camera.position.y - (14.2 + 22 * Math.sin(20 * Math.PI / 180))) < 1e-9);
    assert.ok(Math.abs(rig.camera.position.z - (-38.5 + 22 * Math.cos(20 * Math.PI / 180) * Math.cos(38 * Math.PI / 180))) < 1e-9);
    assert.deepEqual(rig.target.toArray(), [-58.5, 14.2, -38.5]);
    const forward = rig.camera.getWorldDirection(rig.target.clone());
    const expected = rig.target.clone().sub(rig.camera.position).normalize();
    assert.ok(forward.toArray().every((value, i) => Math.abs(value - expected.toArray()[i]) < 1e-9));
    // Orbit and zoom remain functional after a programmatic inspection view.
    rig.zoomBy(0.5);
    assert.equal(rig.distance, 12);
    assert.ok(Math.abs(rig.camera.position.y - (14.2 + 12 * Math.sin(20 * Math.PI / 180))) < 1e-9);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
