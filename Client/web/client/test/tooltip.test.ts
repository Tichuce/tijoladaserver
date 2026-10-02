// Hover tooltip layout, against the desktop client's Tooltip.cs / BaseSlot.cs / Map.cs numbers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TIP_HEIGHT, TIP_PADDING, groundItemTip, tipPosition, tipSize } from "../src/tooltip.js";

test("tooltip size is 6px per character plus 6px padding each side, 15px high", () => {
  assert.equal(TIP_PADDING, 6);
  assert.equal(TIP_HEIGHT, 15);
  assert.deepEqual(tipSize("Stick"), [5 * 6 + 12, 15]);
});

test("slot tooltips sit above-right of the mouse, ground ones centred below it", () => {
  // BaseSlot: (mouse.x, mouse.y - CharHeight - 10) at scale 1.
  assert.deepEqual(tipPosition("slot", 200, 300, "Stick", 1, 1280), [200, 279]);
  // At the game screen's scale the offsets scale too.
  assert.deepEqual(tipPosition("slot", 200, 300, "Stick", 2, 1280), [200, 258]);
  // Map: centred on x, 5px below.
  assert.deepEqual(tipPosition("map", 200, 300, "Stick", 1, 1280), [200 - 21, 305]);
  // Kept inside the right edge (Tooltip.SetPosition).
  assert.deepEqual(tipPosition("slot", 1270, 300, "Stick", 1, 1280), [1280 - 42, 279]);
});

test("ground item text adds the stack only when more than one (Map.OnMouseOverMap)", () => {
  assert.equal(groundItemTip("Gold", 1), "Gold");
  assert.equal(groundItemTip("Gold", 250), "Gold (250)");
});
