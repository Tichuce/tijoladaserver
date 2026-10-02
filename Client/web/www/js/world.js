// The map the player is on and everything standing on it (AsperetaClient/Map.cs, the
// Phase 1 subset: tiles, characters, movement, headings and chat bubbles).
import { TILE_SIZE, frameOffset } from "./assets.js";
import { Character } from "./character.js";
const LAYERS = 4;
// Draw this much extra around the screen so tall graphics (trees) don't pop in/out.
const OVERDRAW = 5 * TILE_SIZE;
export class World {
    constructor(map, assets) {
        this.map = map;
        this.assets = assets;
        this.characters = new Map();
        this.player = null;
        this.objects = new Map();
        /** Login ids in the player's party (names drawn yellow). */
        this.partyIds = new Set();
        this.spellTiles = [];
        /** Character highlighted while choosing a spell target. */
        this.target = null;
        /** True while the player is choosing a spell target; the box is drawn only then. */
        this.showTarget = false;
        this.occupant = new Array(map.width * map.height).fill(null);
    }
    get width() { return this.map.width; }
    get height() { return this.map.height; }
    validTile(x, y) {
        return x >= 0 && y >= 0 && x < this.map.width && y < this.map.height;
    }
    at(x, y) {
        return y * this.map.width + x;
    }
    /** The character drawn under a screen point (Map.OnRightClick / OnDoubleClick hit test). */
    characterAtPoint(px, py, screenW, screenH) {
        const [camX, camY] = this.camera(screenW, screenH);
        for (const c of this.characters.values()) {
            const box = c.bodyBox();
            const x = Math.trunc(c.pixelX) - camX + box.x;
            const y = Math.trunc(c.pixelY) - camY + box.y;
            if (px >= x && px <= x + box.w && py >= y && py <= y + box.h)
                return c;
        }
        return null;
    }
    characterAt(x, y) {
        return this.validTile(x, y) ? this.occupant[this.at(x, y)] : null;
    }
    /** Client-side prediction only; the server decides and corrects with SUP. */
    canMoveTo(x, y) {
        if (!this.validTile(x, y))
            return false;
        const i = this.at(x, y);
        return this.map.blocked[i] !== 1 && this.occupant[i] === null;
    }
    addCharacter(data) {
        // The server re-sends MKC for characters it thinks we lost; replace cleanly.
        this.removeCharacter(data.loginId);
        const character = new Character(data, this.assets);
        this.characters.set(character.loginId, character);
        if (this.validTile(character.tileX, character.tileY))
            this.occupant[this.at(character.tileX, character.tileY)] = character;
        if (this.player?.loginId === character.loginId)
            this.player = character;
        character.inParty = this.partyIds.has(character.loginId);
        return character;
    }
    removeCharacter(loginId) {
        const character = this.characters.get(loginId);
        if (!character)
            return;
        this.clearOccupant(character);
        this.characters.delete(loginId);
    }
    setPlayer(loginId) {
        this.player = this.characters.get(loginId) ?? null;
    }
    updateCharacter(data) {
        const character = this.characters.get(data.loginId);
        if (!character)
            return;
        character.setAppearance({ ...character.appearance, ...data });
    }
    changeHeading(loginId, facing) {
        this.characters.get(loginId)?.setFacing(facing);
    }
    /** Map.MoveCharacter: walk to adjacent tiles, snap anything further. */
    moveCharacter(character, x, y) {
        if (!this.validTile(x, y))
            return;
        this.clearOccupant(character);
        this.occupant[this.at(x, y)] = character;
        if (Math.abs(character.tileX - x) > 1 || Math.abs(character.tileY - y) > 1)
            character.setPosition(x, y);
        else
            character.moveTo(x, y);
    }
    /** SUP: the server's word on where we are. */
    setPlayerPosition(x, y) {
        const player = this.player;
        if (!player || !this.validTile(x, y))
            return;
        this.clearOccupant(player);
        player.setPosition(x, y);
        this.occupant[this.at(x, y)] = player;
    }
    clearOccupant(character) {
        if (!this.validTile(character.tileX, character.tileY))
            return;
        const i = this.at(character.tileX, character.tileY);
        if (this.occupant[i] === character)
            this.occupant[i] = null;
    }
    update(dt) {
        for (const character of this.characters.values())
            character.update(dt);
        for (const s of this.spellTiles)
            s.anim.update(dt);
        this.spellTiles = this.spellTiles.filter((s) => !s.anim.done);
    }
    setObject(x, y, object) {
        if (!this.validTile(x, y))
            return;
        if (object)
            this.objects.set(this.at(x, y), object);
        else
            this.objects.delete(this.at(x, y));
    }
    objectAt(x, y) {
        return this.validTile(x, y) ? this.objects.get(this.at(x, y)) : undefined;
    }
    addSpellTile(x, y, anim) {
        if (!this.validTile(x, y))
            return;
        this.spellTiles = this.spellTiles.filter((s) => s.x !== x || s.y !== y);
        this.spellTiles.push({ x, y, anim });
    }
    /** Characters within view of the player, in row-major tile order (for spell targeting). */
    visibleCharacters(rangeX, rangeY) {
        const p = this.player;
        if (!p)
            return [];
        return [...this.characters.values()]
            .filter((c) => Math.abs(c.tileX - p.tileX) <= rangeX && Math.abs(c.tileY - p.tileY) <= rangeY)
            .sort((a, b) => (a.tileY * this.width + a.tileX) - (b.tileY * this.width + b.tileX));
    }
    /** Camera: the player centred, as GameScreen.RenderOffsetX/Y. */
    camera(screenW, screenH) {
        const p = this.player;
        if (!p)
            return [0, 0];
        return [Math.trunc(p.pixelX) - (screenW / 2 - TILE_SIZE / 2), Math.trunc(p.pixelY) - (screenH / 2 - TILE_SIZE)];
    }
    render(ctx, screenW, screenH) {
        const [camX, camY] = this.camera(screenW, screenH);
        const { width, height, layers } = this.map;
        const x0 = Math.max(0, Math.trunc((camX - OVERDRAW) / TILE_SIZE));
        const y0 = Math.max(0, Math.trunc((camY - OVERDRAW) / TILE_SIZE));
        const x1 = Math.min(width - 1, Math.trunc((camX + screenW + OVERDRAW) / TILE_SIZE));
        const y1 = Math.min(height - 1, Math.trunc((camY + screenH + OVERDRAW) / TILE_SIZE));
        for (let l = 0; l < LAYERS; l++) {
            for (let y = y0; y <= y1; y++) {
                for (let x = x0; x <= x1; x++) {
                    const i = y * width + x;
                    const sx = x * TILE_SIZE - camX;
                    const sy = y * TILE_SIZE - camY;
                    // Items, characters and spell effects are drawn as part of layer 2 so roofs and
                    // treetops cover them (Map.Render).
                    if (l === 2) {
                        const object = this.objects.get(i);
                        if (object) {
                            const d = this.assets.drawable(object.graphic, object.tint[3] > 0 ? object.tint : null);
                            if (d) {
                                const [ox, oy] = frameOffset(d.w, d.h, "character");
                                ctx.drawImage(d.source, d.sx, d.sy, d.w, d.h, sx + ox, sy + oy, d.w, d.h);
                            }
                        }
                        this.occupant[i]?.render(ctx, camX, camY);
                        for (const s of this.spellTiles) {
                            if (s.x !== x || s.y !== y)
                                continue;
                            const d = this.assets.drawable(s.anim.frame, null);
                            if (!d)
                                continue;
                            const [ox, oy] = frameOffset(d.w, d.h, "spell");
                            ctx.drawImage(d.source, d.sx, d.sy, d.w, d.h, sx + ox, sy + oy, d.w, d.h);
                        }
                    }
                    const frameId = layers[i * 4 + l];
                    if (frameId <= 0)
                        continue;
                    const d = this.assets.drawable(frameId, null);
                    if (!d)
                        continue;
                    const [ox, oy] = frameOffset(d.w, d.h, "map");
                    ctx.drawImage(d.source, d.sx, d.sy, d.w, d.h, sx + ox, sy + oy, d.w, d.h);
                }
            }
        }
        // Names and chat bubbles on top of everything.
        ctx.font = "11px Verdana, Tahoma, sans-serif";
        ctx.textBaseline = "top";
        if (this.showTarget && this.target && this.characters.get(this.target.loginId) === this.target)
            this.renderTargetBox(ctx, this.target, camX, camY);
        for (const c of this.characters.values()) {
            this.renderName(ctx, c, camX, camY);
            this.renderBars(ctx, c, camX, camY);
            this.renderBattleText(ctx, c, camX, camY);
        }
        for (const c of this.characters.values())
            this.renderChat(ctx, c, camX, camY);
    }
    renderName(ctx, c, camX, camY) {
        const name = c.displayName;
        if (!name)
            return;
        const box = c.bodyBox();
        const w = ctx.measureText(name).width;
        const x = Math.round(Math.trunc(c.pixelX) - camX + box.x + box.w / 2 - w / 2);
        const y = Math.trunc(c.pixelY) - camY + box.y - 13 - 7;
        ctx.fillStyle = "rgb(1,1,1)";
        ctx.fillText(name, x + 1, y + 1);
        ctx.fillStyle = c.inParty && c !== this.player ? "rgb(248,208,0)" : c === this.player ? "rgb(255,255,255)" : "rgb(230,230,230)";
        ctx.fillText(name, x, y);
        if (c.icon)
            this.renderQuestIcon(ctx, c, x + w / 2, y);
    }
    renderTargetBox(ctx, c, camX, camY) {
        const box = c.bodyBox();
        const x = Math.trunc(c.pixelX) - camX + box.x;
        const y = Math.trunc(c.pixelY) - camY + box.y;
        ctx.strokeStyle = "rgb(255,255,255)";
        ctx.strokeRect(x + 0.5, y + 0.5, box.w - 1, box.h - 1);
        ctx.strokeStyle = "rgb(0,100,248)";
        ctx.strokeRect(x + 1.5, y + 1.5, box.w - 3, box.h - 3);
    }
    /** HP/MP bars, shown for two seconds after a vitals update (Character.RenderHPMPBars). */
    renderBars(ctx, c, camX, camY) {
        if (!c.showBars)
            return;
        const box = c.bodyBox();
        const x = Math.trunc(c.pixelX) - camX + box.x;
        const y = Math.trunc(c.pixelY) - camY + box.y - 8;
        ctx.fillStyle = "rgb(1,1,1)";
        ctx.fillRect(x, y, box.w, 3);
        ctx.fillStyle = "rgb(0,252,0)";
        ctx.fillRect(x, y, Math.trunc(box.w * (c.hpPercent / 100)), 3);
        ctx.fillStyle = "rgb(0,0,248)";
        ctx.fillRect(x, y + 3, Math.trunc(box.w * (c.mpPercent / 100)), 2);
    }
    renderBattleText(ctx, c, camX, camY) {
        for (const bt of c.battleText) {
            const x = Math.round(Math.trunc(c.pixelX) - camX + bt.x);
            const y = Math.round(Math.trunc(c.pixelY) - camY + bt.y);
            ctx.fillStyle = "rgb(1,1,1)";
            ctx.fillText(bt.text, x + 1, y + 1);
            ctx.fillStyle = bt.colour;
            ctx.fillText(bt.text, x, y);
        }
    }
    /**
     * CHI quest indicator above the name. The sheet/graphic pair is drawn when it names a
     * frame of that sheet; Aspereta's data has no quest art, so otherwise a "!" (available,
     * graphic 1) or "?" (ready) marker is drawn instead.
     */
    renderQuestIcon(ctx, c, centerX, nameTop) {
        const icon = c.icon;
        const frame = this.assets.frame(icon.graphic);
        if (frame && frame.file === icon.sheet) {
            const d = this.assets.drawable(icon.graphic, null);
            if (d)
                ctx.drawImage(d.source, d.sx, d.sy, d.w, d.h, Math.round(centerX - d.w / 2), nameTop - d.h - 2, d.w, d.h);
            return;
        }
        const mark = icon.graphic === 1 ? "!" : "?";
        ctx.save();
        ctx.font = "bold 16px Verdana, Tahoma, sans-serif";
        const mw = ctx.measureText(mark).width;
        const x = Math.round(centerX - mw / 2);
        const y = nameTop - 18;
        ctx.fillStyle = "rgb(1,1,1)";
        ctx.fillText(mark, x + 1, y + 1);
        ctx.fillStyle = icon.graphic === 1 ? "rgb(248,208,0)" : "rgb(136,204,64)";
        ctx.fillText(mark, x, y);
        ctx.restore();
    }
    renderChat(ctx, c, camX, camY) {
        if (c.chatMessage === null)
            return;
        const maxW = 184;
        const padding = 5;
        const lines = wrap(ctx, c.chatMessage, maxW - padding * 2);
        const textW = Math.max(...lines.map((line) => ctx.measureText(line).width));
        const bw = Math.min(maxW, Math.ceil(textW) + padding * 2);
        const bh = lines.length * 13 + 5;
        const box = c.bodyBox();
        const x = Math.round(Math.trunc(c.pixelX) - camX + box.x + box.w / 2 - bw / 2);
        const y = Math.trunc(c.pixelY) - camY + box.y - bh - 7;
        ctx.fillStyle = "rgb(1,1,1)";
        ctx.fillRect(x, y, bw, bh);
        ctx.strokeStyle = "rgb(255,255,255)";
        ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, bh - 1);
        ctx.fillStyle = "rgb(255,255,255)";
        lines.forEach((line, i) => ctx.fillText(line, x + padding, y + i * 13 + 3));
    }
}
function wrap(ctx, text, maxWidth) {
    const words = text.split(" ");
    const lines = [];
    let line = "";
    for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (ctx.measureText(candidate).width > maxWidth && line) {
            lines.push(line);
            line = word;
        }
        else {
            line = candidate;
        }
    }
    if (line)
        lines.push(line);
    return lines.length ? lines : [""];
}
