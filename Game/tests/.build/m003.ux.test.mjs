// tests/m003.ux.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
var source = (path) => readFileSync(fileURLToPath(new URL("../" + path, import.meta.url)), "utf8");
test("touch controls are exposed with accessible names and browser zoom remains available", () => {
  const html = source("../index.html");
  assert.doesNotMatch(html, /user-scalable\s*=\s*no/);
  const controls = html.match(/<div id="controls"[^>]*>/)?.[0];
  assert.ok(controls);
  assert.doesNotMatch(controls, /aria-hidden/);
  assert.match(controls, /aria-label="World movement and zoom controls"/);
  const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map((match) => match[0]);
  assert.equal(buttons.length, 8);
  for (const button of buttons) assert.match(button, /aria-label="[^"]+"/);
});
test("mobile tabs preserve separate Settlement, Build and World panels", () => {
  const html = source("../index.html");
  const css = source("../src/styles.css");
  assert.match(html, /type="radio" name="game-panel" checked id="world-panel"/);
  assert.match(html, /<label class="drawer-settlement" for="world-panel">Settlement<\/label>/);
  assert.match(html, /<label class="drawer-build" for="build-drawer">Build<\/label>/);
  assert.match(html, /<label class="drawer-world" for="world-drawer">World<\/label>/);
  assert.match(css, /\.world-drawer-state:checked ~ #build-panel \.build-cards \{ display: none; \}/);
  assert.match(css, /#build-drawer:checked ~ #build-panel \{ display: block; \}/);
  assert.match(css, /#build-drawer:checked ~ #life-panel, \.world-drawer-state:checked ~ #life-panel \{ display: none; \}/);
  assert.doesNotMatch(
    css,
    /world-drawer-state:checked ~ \.inspector\s*\{\s*display:\s*none/,
    "World controls hide settlement/build panels but keep object inspection usable"
  );
  assert.match(css, /#build-drawer:checked ~ \.inspector \{ display: none; \}/);
  assert.match(html, /id="gather-nearest" aria-label="Gather nearest natural resource"/);
});
test("global shortcuts guard interactive targets before camera key handling", () => {
  const main = source("../src/main.ts");
  const handler = main.slice(main.indexOf("window.addEventListener('keydown'"));
  assert.match(
    handler,
    /e\.key !== 'Escape' && target instanceof HTMLElement/,
    "global camera shortcut suppression cannot intercept Escape from focused UI"
  );
  assert.match(handler, /target instanceof HTMLElement/);
  assert.match(handler, /target\.isContentEditable/);
  assert.match(handler, /input, textarea, select, button, a\[href\], \[contenteditable\], \[role="textbox"\]/);
  assert.match(handler, /e\.stopImmediatePropagation\(\)/);
  assert.match(handler, /new KeyboardEvent\('keyup'/);
  assert.match(handler, /\},\s*\{\s*capture:\s*true\s*\}\);/);
});
test("a build has one immediate toast that retains save failure and success details", () => {
  const m2 = source("../src/app/m2.ts");
  const build = m2.slice(m2.indexOf("private build("), m2.indexOf("private addStructure("));
  assert.equal(
    (build.match(/this\.panel\.toast\(/g) ?? []).length,
    3,
    "two rejection branches and one accepted-build branch"
  );
  const accepted = build.slice(build.indexOf("const saved ="), build.indexOf("this.panel.setInventory"));
  assert.equal((accepted.match(/this\.panel\.toast\(/g) ?? []).length, 1);
  assert.match(accepted, /\$\{saved\.message\}/);
  assert.match(accepted, /saved\.ok \? 'good' : 'bad'/);
  assert.ok(accepted.indexOf("built \xB7 paid") < accepted.indexOf("saved.message"));
});
test("canvas blur preserves inspection when focus enters its Close control", () => {
  const inspector = source("../src/app/inspector.ts");
  assert.match(inspector, /canvas\.addEventListener\('blur', \(event\) => \{/);
  assert.match(inspector, /const nextFocus = event\.relatedTarget/);
  assert.match(
    inspector,
    /!this\.panel\.root\.contains\(nextFocus as Node \| null\)/,
    "focus transfer to Close cannot cancel its click by hiding the card"
  );
});
test("inspection numeric parameters reject non-finite and out-of-range values", () => {
  const main = source("../src/main.ts");
  assert.match(main, /!Number\.isFinite\(value\)/);
  assert.match(main, /num\('radius', 3, 1, 8, true\)/);
  assert.match(main, /num\('macro', 8, 1, 64, true\)/);
  assert.match(main, /num\('mapmacro', 8, 1, 64, true\)/);
  assert.match(main, /num\('t', 0\.42, 0, 1\)/);
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vbTAwMy51eC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgYXNzZXJ0IGZyb20gJ25vZGU6YXNzZXJ0L3N0cmljdCc7XG5pbXBvcnQgdGVzdCBmcm9tICdub2RlOnRlc3QnO1xuaW1wb3J0IHsgcmVhZEZpbGVTeW5jIH0gZnJvbSAnbm9kZTpmcyc7XG5pbXBvcnQgeyBmaWxlVVJMVG9QYXRoIH0gZnJvbSAnbm9kZTp1cmwnO1xuXG5jb25zdCBzb3VyY2UgPSAocGF0aDogc3RyaW5nKSA9PiByZWFkRmlsZVN5bmMoZmlsZVVSTFRvUGF0aChuZXcgVVJMKCcuLi8nICsgcGF0aCwgaW1wb3J0Lm1ldGEudXJsKSksICd1dGY4Jyk7XG5cbnRlc3QoJ3RvdWNoIGNvbnRyb2xzIGFyZSBleHBvc2VkIHdpdGggYWNjZXNzaWJsZSBuYW1lcyBhbmQgYnJvd3NlciB6b29tIHJlbWFpbnMgYXZhaWxhYmxlJywgKCkgPT4ge1xuICBjb25zdCBodG1sID0gc291cmNlKCcuLi9pbmRleC5odG1sJyk7XG4gIGFzc2VydC5kb2VzTm90TWF0Y2goaHRtbCwgL3VzZXItc2NhbGFibGVcXHMqPVxccypuby8pO1xuICBjb25zdCBjb250cm9scyA9IGh0bWwubWF0Y2goLzxkaXYgaWQ9XCJjb250cm9sc1wiW14+XSo+Lyk/LlswXSE7XG4gIGFzc2VydC5vayhjb250cm9scyk7XG4gIGFzc2VydC5kb2VzTm90TWF0Y2goY29udHJvbHMhLCAvYXJpYS1oaWRkZW4vKTtcbiAgYXNzZXJ0Lm1hdGNoKGNvbnRyb2xzISwgL2FyaWEtbGFiZWw9XCJXb3JsZCBtb3ZlbWVudCBhbmQgem9vbSBjb250cm9sc1wiLyk7XG4gIGNvbnN0IGJ1dHRvbnMgPSBbLi4uaHRtbC5tYXRjaEFsbCgvPGJ1dHRvblxcYltePl0qPi9nKV0ubWFwKChtYXRjaCkgPT4gbWF0Y2hbMF0pO1xuICBhc3NlcnQuZXF1YWwoYnV0dG9ucy5sZW5ndGgsIDgpO1xuICBmb3IgKGNvbnN0IGJ1dHRvbiBvZiBidXR0b25zKSBhc3NlcnQubWF0Y2goYnV0dG9uLCAvYXJpYS1sYWJlbD1cIlteXCJdK1wiLyk7XG59KTtcblxudGVzdCgnbW9iaWxlIHRhYnMgcHJlc2VydmUgc2VwYXJhdGUgU2V0dGxlbWVudCwgQnVpbGQgYW5kIFdvcmxkIHBhbmVscycsICgpID0+IHtcbiAgY29uc3QgaHRtbCA9IHNvdXJjZSgnLi4vaW5kZXguaHRtbCcpO1xuICBjb25zdCBjc3MgPSBzb3VyY2UoJy4uL3NyYy9zdHlsZXMuY3NzJyk7XG4gIGFzc2VydC5tYXRjaChodG1sLCAvdHlwZT1cInJhZGlvXCIgbmFtZT1cImdhbWUtcGFuZWxcIiBjaGVja2VkIGlkPVwid29ybGQtcGFuZWxcIi8pO1xuICBhc3NlcnQubWF0Y2goaHRtbCwgLzxsYWJlbCBjbGFzcz1cImRyYXdlci1zZXR0bGVtZW50XCIgZm9yPVwid29ybGQtcGFuZWxcIj5TZXR0bGVtZW50PFxcL2xhYmVsPi8pO1xuICBhc3NlcnQubWF0Y2goaHRtbCwgLzxsYWJlbCBjbGFzcz1cImRyYXdlci1idWlsZFwiIGZvcj1cImJ1aWxkLWRyYXdlclwiPkJ1aWxkPFxcL2xhYmVsPi8pO1xuICBhc3NlcnQubWF0Y2goaHRtbCwgLzxsYWJlbCBjbGFzcz1cImRyYXdlci13b3JsZFwiIGZvcj1cIndvcmxkLWRyYXdlclwiPldvcmxkPFxcL2xhYmVsPi8pO1xuICBhc3NlcnQubWF0Y2goY3NzLCAvXFwud29ybGQtZHJhd2VyLXN0YXRlOmNoZWNrZWQgfiAjYnVpbGQtcGFuZWwgXFwuYnVpbGQtY2FyZHMgXFx7IGRpc3BsYXk6IG5vbmU7IFxcfS8pO1xuICBhc3NlcnQubWF0Y2goY3NzLCAvI2J1aWxkLWRyYXdlcjpjaGVja2VkIH4gI2J1aWxkLXBhbmVsIFxceyBkaXNwbGF5OiBibG9jazsgXFx9Lyk7XG4gIGFzc2VydC5tYXRjaChjc3MsIC8jYnVpbGQtZHJhd2VyOmNoZWNrZWQgfiAjbGlmZS1wYW5lbCwgXFwud29ybGQtZHJhd2VyLXN0YXRlOmNoZWNrZWQgfiAjbGlmZS1wYW5lbCBcXHsgZGlzcGxheTogbm9uZTsgXFx9Lyk7XG4gIGFzc2VydC5kb2VzTm90TWF0Y2goY3NzLCAvd29ybGQtZHJhd2VyLXN0YXRlOmNoZWNrZWQgfiBcXC5pbnNwZWN0b3JcXHMqXFx7XFxzKmRpc3BsYXk6XFxzKm5vbmUvLFxuICAgICdXb3JsZCBjb250cm9scyBoaWRlIHNldHRsZW1lbnQvYnVpbGQgcGFuZWxzIGJ1dCBrZWVwIG9iamVjdCBpbnNwZWN0aW9uIHVzYWJsZScpO1xuICBhc3NlcnQubWF0Y2goY3NzLCAvI2J1aWxkLWRyYXdlcjpjaGVja2VkIH4gXFwuaW5zcGVjdG9yIFxceyBkaXNwbGF5OiBub25lOyBcXH0vKTtcbiAgYXNzZXJ0Lm1hdGNoKGh0bWwsIC9pZD1cImdhdGhlci1uZWFyZXN0XCIgYXJpYS1sYWJlbD1cIkdhdGhlciBuZWFyZXN0IG5hdHVyYWwgcmVzb3VyY2VcIi8pO1xufSk7XG5cbnRlc3QoJ2dsb2JhbCBzaG9ydGN1dHMgZ3VhcmQgaW50ZXJhY3RpdmUgdGFyZ2V0cyBiZWZvcmUgY2FtZXJhIGtleSBoYW5kbGluZycsICgpID0+IHtcbiAgY29uc3QgbWFpbiA9IHNvdXJjZSgnLi4vc3JjL21haW4udHMnKTtcbiAgY29uc3QgaGFuZGxlciA9IG1haW4uc2xpY2UobWFpbi5pbmRleE9mKFwid2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nXCIpKTtcbiAgYXNzZXJ0Lm1hdGNoKGhhbmRsZXIsIC9lXFwua2V5ICE9PSAnRXNjYXBlJyAmJiB0YXJnZXQgaW5zdGFuY2VvZiBIVE1MRWxlbWVudC8sXG4gICAgJ2dsb2JhbCBjYW1lcmEgc2hvcnRjdXQgc3VwcHJlc3Npb24gY2Fubm90IGludGVyY2VwdCBFc2NhcGUgZnJvbSBmb2N1c2VkIFVJJyk7XG4gIGFzc2VydC5tYXRjaChoYW5kbGVyLCAvdGFyZ2V0IGluc3RhbmNlb2YgSFRNTEVsZW1lbnQvKTtcbiAgYXNzZXJ0Lm1hdGNoKGhhbmRsZXIsIC90YXJnZXRcXC5pc0NvbnRlbnRFZGl0YWJsZS8pO1xuICBhc3NlcnQubWF0Y2goaGFuZGxlciwgL2lucHV0LCB0ZXh0YXJlYSwgc2VsZWN0LCBidXR0b24sIGFcXFtocmVmXFxdLCBcXFtjb250ZW50ZWRpdGFibGVcXF0sIFxcW3JvbGU9XCJ0ZXh0Ym94XCJcXF0vKTtcbiAgYXNzZXJ0Lm1hdGNoKGhhbmRsZXIsIC9lXFwuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uXFwoXFwpLyk7XG4gIGFzc2VydC5tYXRjaChoYW5kbGVyLCAvbmV3IEtleWJvYXJkRXZlbnRcXCgna2V5dXAnLyk7XG4gIGFzc2VydC5tYXRjaChoYW5kbGVyLCAvXFx9LFxccypcXHtcXHMqY2FwdHVyZTpcXHMqdHJ1ZVxccypcXH1cXCk7Lyk7XG59KTtcblxudGVzdCgnYSBidWlsZCBoYXMgb25lIGltbWVkaWF0ZSB0b2FzdCB0aGF0IHJldGFpbnMgc2F2ZSBmYWlsdXJlIGFuZCBzdWNjZXNzIGRldGFpbHMnLCAoKSA9PiB7XG4gIGNvbnN0IG0yID0gc291cmNlKCcuLi9zcmMvYXBwL20yLnRzJyk7XG4gIGNvbnN0IGJ1aWxkID0gbTIuc2xpY2UobTIuaW5kZXhPZigncHJpdmF0ZSBidWlsZCgnKSwgbTIuaW5kZXhPZigncHJpdmF0ZSBhZGRTdHJ1Y3R1cmUoJykpO1xuICBhc3NlcnQuZXF1YWwoKGJ1aWxkLm1hdGNoKC90aGlzXFwucGFuZWxcXC50b2FzdFxcKC9nKSA/PyBbXSkubGVuZ3RoLCAzLFxuICAgICd0d28gcmVqZWN0aW9uIGJyYW5jaGVzIGFuZCBvbmUgYWNjZXB0ZWQtYnVpbGQgYnJhbmNoJyk7XG4gIGNvbnN0IGFjY2VwdGVkID0gYnVpbGQuc2xpY2UoYnVpbGQuaW5kZXhPZignY29uc3Qgc2F2ZWQgPScpLCBidWlsZC5pbmRleE9mKCd0aGlzLnBhbmVsLnNldEludmVudG9yeScpKTtcbiAgYXNzZXJ0LmVxdWFsKChhY2NlcHRlZC5tYXRjaCgvdGhpc1xcLnBhbmVsXFwudG9hc3RcXCgvZykgPz8gW10pLmxlbmd0aCwgMSk7XG4gIGFzc2VydC5tYXRjaChhY2NlcHRlZCwgL1xcJFxce3NhdmVkXFwubWVzc2FnZVxcfS8pO1xuICBhc3NlcnQubWF0Y2goYWNjZXB0ZWQsIC9zYXZlZFxcLm9rIFxcPyAnZ29vZCcgOiAnYmFkJy8pO1xuICBhc3NlcnQub2soYWNjZXB0ZWQuaW5kZXhPZignYnVpbHQgXHUwMEI3IHBhaWQnKSA8IGFjY2VwdGVkLmluZGV4T2YoJ3NhdmVkLm1lc3NhZ2UnKSk7XG59KTtcblxudGVzdCgnY2FudmFzIGJsdXIgcHJlc2VydmVzIGluc3BlY3Rpb24gd2hlbiBmb2N1cyBlbnRlcnMgaXRzIENsb3NlIGNvbnRyb2wnLCAoKSA9PiB7XG4gIGNvbnN0IGluc3BlY3RvciA9IHNvdXJjZSgnLi4vc3JjL2FwcC9pbnNwZWN0b3IudHMnKTtcbiAgYXNzZXJ0Lm1hdGNoKGluc3BlY3RvciwgL2NhbnZhc1xcLmFkZEV2ZW50TGlzdGVuZXJcXCgnYmx1cicsIFxcKGV2ZW50XFwpID0+IFxcey8pO1xuICBhc3NlcnQubWF0Y2goaW5zcGVjdG9yLCAvY29uc3QgbmV4dEZvY3VzID0gZXZlbnRcXC5yZWxhdGVkVGFyZ2V0Lyk7XG4gIGFzc2VydC5tYXRjaChpbnNwZWN0b3IsIC8hdGhpc1xcLnBhbmVsXFwucm9vdFxcLmNvbnRhaW5zXFwobmV4dEZvY3VzIGFzIE5vZGUgXFx8IG51bGxcXCkvLFxuICAgICdmb2N1cyB0cmFuc2ZlciB0byBDbG9zZSBjYW5ub3QgY2FuY2VsIGl0cyBjbGljayBieSBoaWRpbmcgdGhlIGNhcmQnKTtcbn0pO1xuXG50ZXN0KCdpbnNwZWN0aW9uIG51bWVyaWMgcGFyYW1ldGVycyByZWplY3Qgbm9uLWZpbml0ZSBhbmQgb3V0LW9mLXJhbmdlIHZhbHVlcycsICgpID0+IHtcbiAgY29uc3QgbWFpbiA9IHNvdXJjZSgnLi4vc3JjL21haW4udHMnKTtcbiAgYXNzZXJ0Lm1hdGNoKG1haW4sIC8hTnVtYmVyXFwuaXNGaW5pdGVcXCh2YWx1ZVxcKS8pO1xuICBhc3NlcnQubWF0Y2gobWFpbiwgL251bVxcKCdyYWRpdXMnLCAzLCAxLCA4LCB0cnVlXFwpLyk7XG4gIGFzc2VydC5tYXRjaChtYWluLCAvbnVtXFwoJ21hY3JvJywgOCwgMSwgNjQsIHRydWVcXCkvKTtcbiAgYXNzZXJ0Lm1hdGNoKG1haW4sIC9udW1cXCgnbWFwbWFjcm8nLCA4LCAxLCA2NCwgdHJ1ZVxcKS8pO1xuICBhc3NlcnQubWF0Y2gobWFpbiwgL251bVxcKCd0JywgMFxcLjQyLCAwLCAxXFwpLyk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBQSxPQUFPLFlBQVk7QUFDbkIsT0FBTyxVQUFVO0FBQ2pCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMscUJBQXFCO0FBRTlCLElBQU0sU0FBUyxDQUFDLFNBQWlCLGFBQWEsY0FBYyxJQUFJLElBQUksUUFBUSxNQUFNLFlBQVksR0FBRyxDQUFDLEdBQUcsTUFBTTtBQUUzRyxLQUFLLHVGQUF1RixNQUFNO0FBQ2hHLFFBQU0sT0FBTyxPQUFPLGVBQWU7QUFDbkMsU0FBTyxhQUFhLE1BQU0sd0JBQXdCO0FBQ2xELFFBQU0sV0FBVyxLQUFLLE1BQU0sMEJBQTBCLElBQUksQ0FBQztBQUMzRCxTQUFPLEdBQUcsUUFBUTtBQUNsQixTQUFPLGFBQWEsVUFBVyxhQUFhO0FBQzVDLFNBQU8sTUFBTSxVQUFXLCtDQUErQztBQUN2RSxRQUFNLFVBQVUsQ0FBQyxHQUFHLEtBQUssU0FBUyxrQkFBa0IsQ0FBQyxFQUFFLElBQUksQ0FBQyxVQUFVLE1BQU0sQ0FBQyxDQUFDO0FBQzlFLFNBQU8sTUFBTSxRQUFRLFFBQVEsQ0FBQztBQUM5QixhQUFXLFVBQVUsUUFBUyxRQUFPLE1BQU0sUUFBUSxvQkFBb0I7QUFDekUsQ0FBQztBQUVELEtBQUssb0VBQW9FLE1BQU07QUFDN0UsUUFBTSxPQUFPLE9BQU8sZUFBZTtBQUNuQyxRQUFNLE1BQU0sT0FBTyxtQkFBbUI7QUFDdEMsU0FBTyxNQUFNLE1BQU0seURBQXlEO0FBQzVFLFNBQU8sTUFBTSxNQUFNLHdFQUF3RTtBQUMzRixTQUFPLE1BQU0sTUFBTSwrREFBK0Q7QUFDbEYsU0FBTyxNQUFNLE1BQU0sK0RBQStEO0FBQ2xGLFNBQU8sTUFBTSxLQUFLLGdGQUFnRjtBQUNsRyxTQUFPLE1BQU0sS0FBSyw0REFBNEQ7QUFDOUUsU0FBTyxNQUFNLEtBQUssc0dBQXNHO0FBQ3hILFNBQU87QUFBQSxJQUFhO0FBQUEsSUFBSztBQUFBLElBQ3ZCO0FBQUEsRUFBK0U7QUFDakYsU0FBTyxNQUFNLEtBQUssMERBQTBEO0FBQzVFLFNBQU8sTUFBTSxNQUFNLGtFQUFrRTtBQUN2RixDQUFDO0FBRUQsS0FBSyx5RUFBeUUsTUFBTTtBQUNsRixRQUFNLE9BQU8sT0FBTyxnQkFBZ0I7QUFDcEMsUUFBTSxVQUFVLEtBQUssTUFBTSxLQUFLLFFBQVEsbUNBQW1DLENBQUM7QUFDNUUsU0FBTztBQUFBLElBQU07QUFBQSxJQUFTO0FBQUEsSUFDcEI7QUFBQSxFQUE0RTtBQUM5RSxTQUFPLE1BQU0sU0FBUywrQkFBK0I7QUFDckQsU0FBTyxNQUFNLFNBQVMsMkJBQTJCO0FBQ2pELFNBQU8sTUFBTSxTQUFTLHFGQUFxRjtBQUMzRyxTQUFPLE1BQU0sU0FBUyxpQ0FBaUM7QUFDdkQsU0FBTyxNQUFNLFNBQVMsNEJBQTRCO0FBQ2xELFNBQU8sTUFBTSxTQUFTLG9DQUFvQztBQUM1RCxDQUFDO0FBRUQsS0FBSyxpRkFBaUYsTUFBTTtBQUMxRixRQUFNLEtBQUssT0FBTyxrQkFBa0I7QUFDcEMsUUFBTSxRQUFRLEdBQUcsTUFBTSxHQUFHLFFBQVEsZ0JBQWdCLEdBQUcsR0FBRyxRQUFRLHVCQUF1QixDQUFDO0FBQ3hGLFNBQU87QUFBQSxLQUFPLE1BQU0sTUFBTSx1QkFBdUIsS0FBSyxDQUFDLEdBQUc7QUFBQSxJQUFRO0FBQUEsSUFDaEU7QUFBQSxFQUFzRDtBQUN4RCxRQUFNLFdBQVcsTUFBTSxNQUFNLE1BQU0sUUFBUSxlQUFlLEdBQUcsTUFBTSxRQUFRLHlCQUF5QixDQUFDO0FBQ3JHLFNBQU8sT0FBTyxTQUFTLE1BQU0sdUJBQXVCLEtBQUssQ0FBQyxHQUFHLFFBQVEsQ0FBQztBQUN0RSxTQUFPLE1BQU0sVUFBVSxzQkFBc0I7QUFDN0MsU0FBTyxNQUFNLFVBQVUsNkJBQTZCO0FBQ3BELFNBQU8sR0FBRyxTQUFTLFFBQVEsaUJBQWMsSUFBSSxTQUFTLFFBQVEsZUFBZSxDQUFDO0FBQ2hGLENBQUM7QUFFRCxLQUFLLHdFQUF3RSxNQUFNO0FBQ2pGLFFBQU0sWUFBWSxPQUFPLHlCQUF5QjtBQUNsRCxTQUFPLE1BQU0sV0FBVyxtREFBbUQ7QUFDM0UsU0FBTyxNQUFNLFdBQVcsd0NBQXdDO0FBQ2hFLFNBQU87QUFBQSxJQUFNO0FBQUEsSUFBVztBQUFBLElBQ3RCO0FBQUEsRUFBb0U7QUFDeEUsQ0FBQztBQUVELEtBQUssMkVBQTJFLE1BQU07QUFDcEYsUUFBTSxPQUFPLE9BQU8sZ0JBQWdCO0FBQ3BDLFNBQU8sTUFBTSxNQUFNLDRCQUE0QjtBQUMvQyxTQUFPLE1BQU0sTUFBTSxnQ0FBZ0M7QUFDbkQsU0FBTyxNQUFNLE1BQU0sZ0NBQWdDO0FBQ25ELFNBQU8sTUFBTSxNQUFNLG1DQUFtQztBQUN0RCxTQUFPLE1BQU0sTUFBTSx5QkFBeUI7QUFDOUMsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
