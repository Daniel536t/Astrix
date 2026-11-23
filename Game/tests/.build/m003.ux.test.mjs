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
  assert.equal(buttons.length, 10);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vbTAwMy51eC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgYXNzZXJ0IGZyb20gJ25vZGU6YXNzZXJ0L3N0cmljdCc7XG5pbXBvcnQgdGVzdCBmcm9tICdub2RlOnRlc3QnO1xuaW1wb3J0IHsgcmVhZEZpbGVTeW5jIH0gZnJvbSAnbm9kZTpmcyc7XG5pbXBvcnQgeyBmaWxlVVJMVG9QYXRoIH0gZnJvbSAnbm9kZTp1cmwnO1xuXG5jb25zdCBzb3VyY2UgPSAocGF0aDogc3RyaW5nKSA9PiByZWFkRmlsZVN5bmMoZmlsZVVSTFRvUGF0aChuZXcgVVJMKCcuLi8nICsgcGF0aCwgaW1wb3J0Lm1ldGEudXJsKSksICd1dGY4Jyk7XG5cbnRlc3QoJ3RvdWNoIGNvbnRyb2xzIGFyZSBleHBvc2VkIHdpdGggYWNjZXNzaWJsZSBuYW1lcyBhbmQgYnJvd3NlciB6b29tIHJlbWFpbnMgYXZhaWxhYmxlJywgKCkgPT4ge1xuICBjb25zdCBodG1sID0gc291cmNlKCcuLi9pbmRleC5odG1sJyk7XG4gIGFzc2VydC5kb2VzTm90TWF0Y2goaHRtbCwgL3VzZXItc2NhbGFibGVcXHMqPVxccypuby8pO1xuICBjb25zdCBjb250cm9scyA9IGh0bWwubWF0Y2goLzxkaXYgaWQ9XCJjb250cm9sc1wiW14+XSo+Lyk/LlswXSE7XG4gIGFzc2VydC5vayhjb250cm9scyk7XG4gIGFzc2VydC5kb2VzTm90TWF0Y2goY29udHJvbHMhLCAvYXJpYS1oaWRkZW4vKTtcbiAgYXNzZXJ0Lm1hdGNoKGNvbnRyb2xzISwgL2FyaWEtbGFiZWw9XCJXb3JsZCBtb3ZlbWVudCBhbmQgem9vbSBjb250cm9sc1wiLyk7XG4gIGNvbnN0IGJ1dHRvbnMgPSBbLi4uaHRtbC5tYXRjaEFsbCgvPGJ1dHRvblxcYltePl0qPi9nKV0ubWFwKChtYXRjaCkgPT4gbWF0Y2hbMF0pO1xuICAvLyA1IHBhZCArIEdhdGhlciArIDIgem9vbSArIEp1bXAgKGV4cGxvcmUsIHRvdWNoKSArIFdhbGsvQnVpbGRlciB2aWV3IG1vZGUgc3dpdGNoLlxuICBhc3NlcnQuZXF1YWwoYnV0dG9ucy5sZW5ndGgsIDEwKTtcbiAgZm9yIChjb25zdCBidXR0b24gb2YgYnV0dG9ucykgYXNzZXJ0Lm1hdGNoKGJ1dHRvbiwgL2FyaWEtbGFiZWw9XCJbXlwiXStcIi8pO1xufSk7XG5cbnRlc3QoJ21vYmlsZSB0YWJzIHByZXNlcnZlIHNlcGFyYXRlIFNldHRsZW1lbnQsIEJ1aWxkIGFuZCBXb3JsZCBwYW5lbHMnLCAoKSA9PiB7XG4gIGNvbnN0IGh0bWwgPSBzb3VyY2UoJy4uL2luZGV4Lmh0bWwnKTtcbiAgY29uc3QgY3NzID0gc291cmNlKCcuLi9zcmMvc3R5bGVzLmNzcycpO1xuICBhc3NlcnQubWF0Y2goaHRtbCwgL3R5cGU9XCJyYWRpb1wiIG5hbWU9XCJnYW1lLXBhbmVsXCIgY2hlY2tlZCBpZD1cIndvcmxkLXBhbmVsXCIvKTtcbiAgYXNzZXJ0Lm1hdGNoKGh0bWwsIC88bGFiZWwgY2xhc3M9XCJkcmF3ZXItc2V0dGxlbWVudFwiIGZvcj1cIndvcmxkLXBhbmVsXCI+U2V0dGxlbWVudDxcXC9sYWJlbD4vKTtcbiAgYXNzZXJ0Lm1hdGNoKGh0bWwsIC88bGFiZWwgY2xhc3M9XCJkcmF3ZXItYnVpbGRcIiBmb3I9XCJidWlsZC1kcmF3ZXJcIj5CdWlsZDxcXC9sYWJlbD4vKTtcbiAgYXNzZXJ0Lm1hdGNoKGh0bWwsIC88bGFiZWwgY2xhc3M9XCJkcmF3ZXItd29ybGRcIiBmb3I9XCJ3b3JsZC1kcmF3ZXJcIj5Xb3JsZDxcXC9sYWJlbD4vKTtcbiAgYXNzZXJ0Lm1hdGNoKGNzcywgL1xcLndvcmxkLWRyYXdlci1zdGF0ZTpjaGVja2VkIH4gI2J1aWxkLXBhbmVsIFxcLmJ1aWxkLWNhcmRzIFxceyBkaXNwbGF5OiBub25lOyBcXH0vKTtcbiAgYXNzZXJ0Lm1hdGNoKGNzcywgLyNidWlsZC1kcmF3ZXI6Y2hlY2tlZCB+ICNidWlsZC1wYW5lbCBcXHsgZGlzcGxheTogYmxvY2s7IFxcfS8pO1xuICBhc3NlcnQubWF0Y2goY3NzLCAvI2J1aWxkLWRyYXdlcjpjaGVja2VkIH4gI2xpZmUtcGFuZWwsIFxcLndvcmxkLWRyYXdlci1zdGF0ZTpjaGVja2VkIH4gI2xpZmUtcGFuZWwgXFx7IGRpc3BsYXk6IG5vbmU7IFxcfS8pO1xuICBhc3NlcnQuZG9lc05vdE1hdGNoKGNzcywgL3dvcmxkLWRyYXdlci1zdGF0ZTpjaGVja2VkIH4gXFwuaW5zcGVjdG9yXFxzKlxce1xccypkaXNwbGF5Olxccypub25lLyxcbiAgICAnV29ybGQgY29udHJvbHMgaGlkZSBzZXR0bGVtZW50L2J1aWxkIHBhbmVscyBidXQga2VlcCBvYmplY3QgaW5zcGVjdGlvbiB1c2FibGUnKTtcbiAgYXNzZXJ0Lm1hdGNoKGNzcywgLyNidWlsZC1kcmF3ZXI6Y2hlY2tlZCB+IFxcLmluc3BlY3RvciBcXHsgZGlzcGxheTogbm9uZTsgXFx9Lyk7XG4gIGFzc2VydC5tYXRjaChodG1sLCAvaWQ9XCJnYXRoZXItbmVhcmVzdFwiIGFyaWEtbGFiZWw9XCJHYXRoZXIgbmVhcmVzdCBuYXR1cmFsIHJlc291cmNlXCIvKTtcbn0pO1xuXG50ZXN0KCdnbG9iYWwgc2hvcnRjdXRzIGd1YXJkIGludGVyYWN0aXZlIHRhcmdldHMgYmVmb3JlIGNhbWVyYSBrZXkgaGFuZGxpbmcnLCAoKSA9PiB7XG4gIGNvbnN0IG1haW4gPSBzb3VyY2UoJy4uL3NyYy9tYWluLnRzJyk7XG4gIGNvbnN0IGhhbmRsZXIgPSBtYWluLnNsaWNlKG1haW4uaW5kZXhPZihcIndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJ1wiKSk7XG4gIGFzc2VydC5tYXRjaChoYW5kbGVyLCAvZVxcLmtleSAhPT0gJ0VzY2FwZScgJiYgdGFyZ2V0IGluc3RhbmNlb2YgSFRNTEVsZW1lbnQvLFxuICAgICdnbG9iYWwgY2FtZXJhIHNob3J0Y3V0IHN1cHByZXNzaW9uIGNhbm5vdCBpbnRlcmNlcHQgRXNjYXBlIGZyb20gZm9jdXNlZCBVSScpO1xuICBhc3NlcnQubWF0Y2goaGFuZGxlciwgL3RhcmdldCBpbnN0YW5jZW9mIEhUTUxFbGVtZW50Lyk7XG4gIGFzc2VydC5tYXRjaChoYW5kbGVyLCAvdGFyZ2V0XFwuaXNDb250ZW50RWRpdGFibGUvKTtcbiAgYXNzZXJ0Lm1hdGNoKGhhbmRsZXIsIC9pbnB1dCwgdGV4dGFyZWEsIHNlbGVjdCwgYnV0dG9uLCBhXFxbaHJlZlxcXSwgXFxbY29udGVudGVkaXRhYmxlXFxdLCBcXFtyb2xlPVwidGV4dGJveFwiXFxdLyk7XG4gIGFzc2VydC5tYXRjaChoYW5kbGVyLCAvZVxcLnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvblxcKFxcKS8pO1xuICBhc3NlcnQubWF0Y2goaGFuZGxlciwgL25ldyBLZXlib2FyZEV2ZW50XFwoJ2tleXVwJy8pO1xuICBhc3NlcnQubWF0Y2goaGFuZGxlciwgL1xcfSxcXHMqXFx7XFxzKmNhcHR1cmU6XFxzKnRydWVcXHMqXFx9XFwpOy8pO1xufSk7XG5cbnRlc3QoJ2EgYnVpbGQgaGFzIG9uZSBpbW1lZGlhdGUgdG9hc3QgdGhhdCByZXRhaW5zIHNhdmUgZmFpbHVyZSBhbmQgc3VjY2VzcyBkZXRhaWxzJywgKCkgPT4ge1xuICBjb25zdCBtMiA9IHNvdXJjZSgnLi4vc3JjL2FwcC9tMi50cycpO1xuICBjb25zdCBidWlsZCA9IG0yLnNsaWNlKG0yLmluZGV4T2YoJ3ByaXZhdGUgYnVpbGQoJyksIG0yLmluZGV4T2YoJ3ByaXZhdGUgYWRkU3RydWN0dXJlKCcpKTtcbiAgYXNzZXJ0LmVxdWFsKChidWlsZC5tYXRjaCgvdGhpc1xcLnBhbmVsXFwudG9hc3RcXCgvZykgPz8gW10pLmxlbmd0aCwgMyxcbiAgICAndHdvIHJlamVjdGlvbiBicmFuY2hlcyBhbmQgb25lIGFjY2VwdGVkLWJ1aWxkIGJyYW5jaCcpO1xuICBjb25zdCBhY2NlcHRlZCA9IGJ1aWxkLnNsaWNlKGJ1aWxkLmluZGV4T2YoJ2NvbnN0IHNhdmVkID0nKSwgYnVpbGQuaW5kZXhPZigndGhpcy5wYW5lbC5zZXRJbnZlbnRvcnknKSk7XG4gIGFzc2VydC5lcXVhbCgoYWNjZXB0ZWQubWF0Y2goL3RoaXNcXC5wYW5lbFxcLnRvYXN0XFwoL2cpID8/IFtdKS5sZW5ndGgsIDEpO1xuICBhc3NlcnQubWF0Y2goYWNjZXB0ZWQsIC9cXCRcXHtzYXZlZFxcLm1lc3NhZ2VcXH0vKTtcbiAgYXNzZXJ0Lm1hdGNoKGFjY2VwdGVkLCAvc2F2ZWRcXC5vayBcXD8gJ2dvb2QnIDogJ2JhZCcvKTtcbiAgYXNzZXJ0Lm9rKGFjY2VwdGVkLmluZGV4T2YoJ2J1aWx0IFx1MDBCNyBwYWlkJykgPCBhY2NlcHRlZC5pbmRleE9mKCdzYXZlZC5tZXNzYWdlJykpO1xufSk7XG5cbnRlc3QoJ2NhbnZhcyBibHVyIHByZXNlcnZlcyBpbnNwZWN0aW9uIHdoZW4gZm9jdXMgZW50ZXJzIGl0cyBDbG9zZSBjb250cm9sJywgKCkgPT4ge1xuICBjb25zdCBpbnNwZWN0b3IgPSBzb3VyY2UoJy4uL3NyYy9hcHAvaW5zcGVjdG9yLnRzJyk7XG4gIGFzc2VydC5tYXRjaChpbnNwZWN0b3IsIC9jYW52YXNcXC5hZGRFdmVudExpc3RlbmVyXFwoJ2JsdXInLCBcXChldmVudFxcKSA9PiBcXHsvKTtcbiAgYXNzZXJ0Lm1hdGNoKGluc3BlY3RvciwgL2NvbnN0IG5leHRGb2N1cyA9IGV2ZW50XFwucmVsYXRlZFRhcmdldC8pO1xuICBhc3NlcnQubWF0Y2goaW5zcGVjdG9yLCAvIXRoaXNcXC5wYW5lbFxcLnJvb3RcXC5jb250YWluc1xcKG5leHRGb2N1cyBhcyBOb2RlIFxcfCBudWxsXFwpLyxcbiAgICAnZm9jdXMgdHJhbnNmZXIgdG8gQ2xvc2UgY2Fubm90IGNhbmNlbCBpdHMgY2xpY2sgYnkgaGlkaW5nIHRoZSBjYXJkJyk7XG59KTtcblxudGVzdCgnaW5zcGVjdGlvbiBudW1lcmljIHBhcmFtZXRlcnMgcmVqZWN0IG5vbi1maW5pdGUgYW5kIG91dC1vZi1yYW5nZSB2YWx1ZXMnLCAoKSA9PiB7XG4gIGNvbnN0IG1haW4gPSBzb3VyY2UoJy4uL3NyYy9tYWluLnRzJyk7XG4gIGFzc2VydC5tYXRjaChtYWluLCAvIU51bWJlclxcLmlzRmluaXRlXFwodmFsdWVcXCkvKTtcbiAgYXNzZXJ0Lm1hdGNoKG1haW4sIC9udW1cXCgncmFkaXVzJywgMywgMSwgOCwgdHJ1ZVxcKS8pO1xuICBhc3NlcnQubWF0Y2gobWFpbiwgL251bVxcKCdtYWNybycsIDgsIDEsIDY0LCB0cnVlXFwpLyk7XG4gIGFzc2VydC5tYXRjaChtYWluLCAvbnVtXFwoJ21hcG1hY3JvJywgOCwgMSwgNjQsIHRydWVcXCkvKTtcbiAgYXNzZXJ0Lm1hdGNoKG1haW4sIC9udW1cXCgndCcsIDBcXC40MiwgMCwgMVxcKS8pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQUEsT0FBTyxZQUFZO0FBQ25CLE9BQU8sVUFBVTtBQUNqQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHFCQUFxQjtBQUU5QixJQUFNLFNBQVMsQ0FBQyxTQUFpQixhQUFhLGNBQWMsSUFBSSxJQUFJLFFBQVEsTUFBTSxZQUFZLEdBQUcsQ0FBQyxHQUFHLE1BQU07QUFFM0csS0FBSyx1RkFBdUYsTUFBTTtBQUNoRyxRQUFNLE9BQU8sT0FBTyxlQUFlO0FBQ25DLFNBQU8sYUFBYSxNQUFNLHdCQUF3QjtBQUNsRCxRQUFNLFdBQVcsS0FBSyxNQUFNLDBCQUEwQixJQUFJLENBQUM7QUFDM0QsU0FBTyxHQUFHLFFBQVE7QUFDbEIsU0FBTyxhQUFhLFVBQVcsYUFBYTtBQUM1QyxTQUFPLE1BQU0sVUFBVywrQ0FBK0M7QUFDdkUsUUFBTSxVQUFVLENBQUMsR0FBRyxLQUFLLFNBQVMsa0JBQWtCLENBQUMsRUFBRSxJQUFJLENBQUMsVUFBVSxNQUFNLENBQUMsQ0FBQztBQUU5RSxTQUFPLE1BQU0sUUFBUSxRQUFRLEVBQUU7QUFDL0IsYUFBVyxVQUFVLFFBQVMsUUFBTyxNQUFNLFFBQVEsb0JBQW9CO0FBQ3pFLENBQUM7QUFFRCxLQUFLLG9FQUFvRSxNQUFNO0FBQzdFLFFBQU0sT0FBTyxPQUFPLGVBQWU7QUFDbkMsUUFBTSxNQUFNLE9BQU8sbUJBQW1CO0FBQ3RDLFNBQU8sTUFBTSxNQUFNLHlEQUF5RDtBQUM1RSxTQUFPLE1BQU0sTUFBTSx3RUFBd0U7QUFDM0YsU0FBTyxNQUFNLE1BQU0sK0RBQStEO0FBQ2xGLFNBQU8sTUFBTSxNQUFNLCtEQUErRDtBQUNsRixTQUFPLE1BQU0sS0FBSyxnRkFBZ0Y7QUFDbEcsU0FBTyxNQUFNLEtBQUssNERBQTREO0FBQzlFLFNBQU8sTUFBTSxLQUFLLHNHQUFzRztBQUN4SCxTQUFPO0FBQUEsSUFBYTtBQUFBLElBQUs7QUFBQSxJQUN2QjtBQUFBLEVBQStFO0FBQ2pGLFNBQU8sTUFBTSxLQUFLLDBEQUEwRDtBQUM1RSxTQUFPLE1BQU0sTUFBTSxrRUFBa0U7QUFDdkYsQ0FBQztBQUVELEtBQUsseUVBQXlFLE1BQU07QUFDbEYsUUFBTSxPQUFPLE9BQU8sZ0JBQWdCO0FBQ3BDLFFBQU0sVUFBVSxLQUFLLE1BQU0sS0FBSyxRQUFRLG1DQUFtQyxDQUFDO0FBQzVFLFNBQU87QUFBQSxJQUFNO0FBQUEsSUFBUztBQUFBLElBQ3BCO0FBQUEsRUFBNEU7QUFDOUUsU0FBTyxNQUFNLFNBQVMsK0JBQStCO0FBQ3JELFNBQU8sTUFBTSxTQUFTLDJCQUEyQjtBQUNqRCxTQUFPLE1BQU0sU0FBUyxxRkFBcUY7QUFDM0csU0FBTyxNQUFNLFNBQVMsaUNBQWlDO0FBQ3ZELFNBQU8sTUFBTSxTQUFTLDRCQUE0QjtBQUNsRCxTQUFPLE1BQU0sU0FBUyxvQ0FBb0M7QUFDNUQsQ0FBQztBQUVELEtBQUssaUZBQWlGLE1BQU07QUFDMUYsUUFBTSxLQUFLLE9BQU8sa0JBQWtCO0FBQ3BDLFFBQU0sUUFBUSxHQUFHLE1BQU0sR0FBRyxRQUFRLGdCQUFnQixHQUFHLEdBQUcsUUFBUSx1QkFBdUIsQ0FBQztBQUN4RixTQUFPO0FBQUEsS0FBTyxNQUFNLE1BQU0sdUJBQXVCLEtBQUssQ0FBQyxHQUFHO0FBQUEsSUFBUTtBQUFBLElBQ2hFO0FBQUEsRUFBc0Q7QUFDeEQsUUFBTSxXQUFXLE1BQU0sTUFBTSxNQUFNLFFBQVEsZUFBZSxHQUFHLE1BQU0sUUFBUSx5QkFBeUIsQ0FBQztBQUNyRyxTQUFPLE9BQU8sU0FBUyxNQUFNLHVCQUF1QixLQUFLLENBQUMsR0FBRyxRQUFRLENBQUM7QUFDdEUsU0FBTyxNQUFNLFVBQVUsc0JBQXNCO0FBQzdDLFNBQU8sTUFBTSxVQUFVLDZCQUE2QjtBQUNwRCxTQUFPLEdBQUcsU0FBUyxRQUFRLGlCQUFjLElBQUksU0FBUyxRQUFRLGVBQWUsQ0FBQztBQUNoRixDQUFDO0FBRUQsS0FBSyx3RUFBd0UsTUFBTTtBQUNqRixRQUFNLFlBQVksT0FBTyx5QkFBeUI7QUFDbEQsU0FBTyxNQUFNLFdBQVcsbURBQW1EO0FBQzNFLFNBQU8sTUFBTSxXQUFXLHdDQUF3QztBQUNoRSxTQUFPO0FBQUEsSUFBTTtBQUFBLElBQVc7QUFBQSxJQUN0QjtBQUFBLEVBQW9FO0FBQ3hFLENBQUM7QUFFRCxLQUFLLDJFQUEyRSxNQUFNO0FBQ3BGLFFBQU0sT0FBTyxPQUFPLGdCQUFnQjtBQUNwQyxTQUFPLE1BQU0sTUFBTSw0QkFBNEI7QUFDL0MsU0FBTyxNQUFNLE1BQU0sZ0NBQWdDO0FBQ25ELFNBQU8sTUFBTSxNQUFNLGdDQUFnQztBQUNuRCxTQUFPLE1BQU0sTUFBTSxtQ0FBbUM7QUFDdEQsU0FBTyxNQUFNLE1BQU0seUJBQXlCO0FBQzlDLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
