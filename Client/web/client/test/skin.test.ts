// The skin layout math, checked against the Maisemore Window.ini values the desktop client uses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { WindowFrame } from "../src/protocol.js";
import { CHAR_W, coords, glyphOffset, objectPosition, parseSkinWindow, skinSectionForFrame, wrapText } from "../src/skin.js";

test("Window.ini sections parse like BaseWindow reads them", () => {
  const inv = parseSkinWindow("Inventory", { image: "Inventory.bmp", windim: "6,5", objoff: "3,18", objdim: "32,32", focus: "175,255", fadeobject: "1" })!;
  assert.deepEqual([inv.rows, inv.columns], [6, 5], "windim = rows, columns");
  assert.deepEqual(inv.alpha, [175, 255]);
  assert.equal(inv.closeBox, null);
  assert.deepEqual(objectPosition(inv, 0), [3, 18]);
  assert.deepEqual(objectPosition(inv, 4), [3 + 4 * 32, 18], "row-major: index 4 is the last column");
  assert.deepEqual(objectPosition(inv, 5), [3, 50], "index 5 starts the second row");

  const quest = parseSkinWindow("BlankMessage", {
    image: "blankmessagewindow.bmp", windim: "20,1", objoff: "2,22", objdim: "100,11", focus: "175,255",
    cboff: "245,5", cbdim: "8,8", button_back: "4,270", button_next: "198,270", button_ok: "105,270", button_close: "105,270", title: "5,3",
  })!;
  assert.deepEqual(quest.closeBox, [245, 5, 8, 8]);
  assert.deepEqual(quest.title, [5, 3]);
  assert.deepEqual(quest.buttons, { back: [4, 270], next: [198, 270], ok: [105, 270], close: [105, 270] });
  assert.deepEqual(objectPosition(quest, 3), [2, 22 + 3 * 11]);

  const c10 = parseSkinWindow("Container10", { image: "container10.bmp", windim: "5,2", objoff: "2,19", objdim: "33,35" })!;
  assert.deepEqual(objectPosition(c10, 9), [2 + 33, 19 + 4 * 35]);
  assert.equal(parseSkinWindow("Nothing", { windim: "1,1" }), null, "no image, no window");
  assert.equal(coords("4,x", 2), null);
});

test("server window frames use the desktop client's skin sections (GameScreen.OnMakeWindow)", () => {
  assert.equal(skinSectionForFrame(WindowFrame.Vendor), "Vendor");
  assert.equal(skinSectionForFrame(WindowFrame.GenericInfo), "BlankMessage3");
  assert.equal(skinSectionForFrame(WindowFrame.Quest), "BlankMessage");
  assert.equal(skinSectionForFrame(WindowFrame.OptionList), "BlankMessage");
  assert.equal(skinSectionForFrame(WindowFrame.TwoSlot), "Container2");
  assert.equal(skinSectionForFrame(WindowFrame.TenSlot), "Container10");
  assert.equal(skinSectionForFrame(WindowFrame.Bank), null, "no skin section: plain window");
});

test("game font glyphs and wrapping (FontRenderer: 6x11 glyphs from '!' on)", () => {
  assert.equal(glyphOffset("!"), 0);
  assert.equal(glyphOffset("A"), 32 * CHAR_W, "! to @ are 32 glyphs");
  assert.equal(glyphOffset("~"), 93 * CHAR_W);
  assert.equal(glyphOffset(" "), -1, "space has no glyph, only an advance");
  assert.deepEqual(wrapText("Hey there, if you're looking to follow the", 42), ["Hey there, if you're looking to follow the"]);
  assert.deepEqual(wrapText("one two three", 7), ["one two", "three"]);
  assert.deepEqual(wrapText("abcdefghij", 4), ["abcd", "efgh", "ij"]);
  assert.deepEqual(wrapText("a\nb", 10), ["a", "b"]);
});
