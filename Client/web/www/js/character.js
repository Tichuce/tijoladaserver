// A character on the map (players and NPCs). Translated from AsperetaClient/Character.cs:
// layered equipment animations picked through compiled.enc, the walk interpolation, and
// the per-facing draw order. Purely visual: positions always come from the server.
import { AnimationType, TILE_SIZE, frameOffset } from "./assets.js";
import { Direction } from "./protocol.js";
/** Draw slots, in Character.DrawAnimations order. */
var Slot;
(function (Slot) {
    Slot[Slot["Body"] = 0] = "Body";
    Slot[Slot["Face"] = 1] = "Face";
    Slot[Slot["Feet"] = 2] = "Feet";
    Slot[Slot["Legs"] = 3] = "Legs";
    Slot[Slot["Chest"] = 4] = "Chest";
    Slot[Slot["Hair"] = 5] = "Hair";
    Slot[Slot["Head"] = 6] = "Head";
    Slot[Slot["Shield"] = 7] = "Shield";
    Slot[Slot["Weapon"] = 8] = "Weapon";
})(Slot || (Slot = {}));
const SLOT_COUNT = 9;
/** A one-shot animation (spell or emote) playing on a character or tile. */
export class OneShot {
    constructor(frames, secondsPerFrame) {
        this.frames = frames;
        this.secondsPerFrame = secondsPerFrame;
        this.time = 0;
        this.index = 0;
        this.done = false;
    }
    update(dt) {
        this.time += dt;
        while (this.time > this.secondsPerFrame && !this.done) {
            this.time -= this.secondsPerFrame;
            this.index++;
            if (this.index >= this.frames.length)
                this.done = true;
        }
    }
    get frame() {
        return this.frames[Math.min(this.index, this.frames.length - 1)];
    }
}
/** BattleTextType values (Packets/BattleTextPacket.cs). */
const RED = "rgb(254,81,28)", GREEN = "rgb(136,204,64)", YELLOW = "rgb(248,208,0)", WHITE = "rgb(255,255,255)";
/** Default walk time per tile in ms (Character.MoveSpeed). */
export const DEFAULT_MOVE_SPEED = 400;
export class Character {
    constructor(data, assets) {
        this.assets = assets;
        this.moving = false;
        this.moveSpeed = DEFAULT_MOVE_SPEED;
        this.moveSpeedX = 0;
        this.moveSpeedY = 0;
        this.slots = new Array(SLOT_COUNT).fill(null);
        this.frameIndex = 0;
        this.frameTime = 0;
        this.chatMessage = null;
        this.chatTime = 0;
        this.attacking = false;
        /** In the player's party: name drawn yellow (Map.OnGroupUpdate). */
        this.inParty = false;
        /** Quest indicator from CHI, or null. */
        this.icon = null;
        this.mpPercent = 0;
        this.barsTime = 0;
        this.showBars = true;
        this.battleText = [];
        this.battleTextPosition = 0;
        this.spell = null;
        this.emote = null;
        this.loginId = data.loginId;
        this.name = data.name;
        this.title = data.title;
        this.surname = data.surname;
        this.tileX = data.x;
        this.tileY = data.y;
        this.pixelX = data.x * TILE_SIZE;
        this.pixelY = data.y * TILE_SIZE;
        this.facing = clampFacing(data.facing);
        this.appearance = data;
        this.hpPercent = data.hpPercent;
        this.updateAnimations();
    }
    get displayName() {
        return [this.title, this.name, this.surname].filter((s) => s && s.trim().length > 0).join(" ");
    }
    setAppearance(appearance) {
        this.appearance = appearance;
        this.updateAnimations();
    }
    setFacing(facing) {
        facing = clampFacing(facing);
        if (facing === this.facing)
            return;
        this.facing = facing;
        this.updateAnimations();
    }
    /** Snap to a tile (warps, corrections, non-adjacent moves). */
    setPosition(x, y) {
        this.tileX = x;
        this.tileY = y;
        this.moving = false;
        this.pixelX = x * TILE_SIZE;
        this.pixelY = y * TILE_SIZE;
        this.moveSpeedX = 0;
        this.moveSpeedY = 0;
        this.updateAnimations();
    }
    /** Walk one tile (Character.MoveTo). */
    moveTo(x, y) {
        this.moving = true;
        this.attacking = false;
        this.moveSpeedX = 0;
        this.moveSpeedY = 0;
        const speed = (1000 * TILE_SIZE) / this.moveSpeed;
        if (y < this.tileY) {
            this.facing = Direction.Up;
            this.moveSpeedY = -speed;
        }
        else if (x > this.tileX) {
            this.facing = Direction.Right;
            this.moveSpeedX = speed;
        }
        else if (y > this.tileY) {
            this.facing = Direction.Down;
            this.moveSpeedY = speed;
        }
        else if (x < this.tileX) {
            this.facing = Direction.Left;
            this.moveSpeedX = -speed;
        }
        this.tileX = x;
        this.tileY = y;
        this.updateAnimations();
    }
    /** Character.Attack: play the attack swing once. */
    attack() {
        this.attacking = true;
        this.updateAnimations();
    }
    setVitals(hp, mp) {
        this.hpPercent = hp;
        this.mpPercent = mp;
        this.showBars = true;
        this.barsTime = 0;
    }
    /** Character.AddBattleText, including the spread pattern for damage numbers. */
    addBattleText(kind, text, measure) {
        if (this.battleText.length === 18)
            return;
        let colour = WHITE;
        let spread = false;
        switch (kind) {
            case 1:
            case 2:
            case 4:
            case 5:
                colour = RED;
                spread = true;
                break;
            case 7:
            case 8:
                colour = GREEN;
                spread = true;
                break;
            case 10:
            case 50:
                text = "STUNNED";
                break;
            case 11:
            case 51:
                text = "ROOTED";
                break;
            case 20:
                text = "DODGE";
                break;
            case 21:
                text = "MISS";
                break;
            case 60:
                colour = YELLOW;
                break;
            case 61:
                colour = RED;
                break;
        }
        const box = this.bodyBox();
        let x = box.x + box.w / 2 - measure(text) / 2;
        let y = box.y;
        if (!spread) {
            y += box.h / 2;
        }
        else {
            this.battleTextPosition = this.battleText.length !== 0 ? (this.battleTextPosition + 1) % 9 : 0;
            y += Math.min(Math.trunc(this.battleText.length / 3), 2) * 8;
            if (this.battleTextPosition % 3 !== 0)
                x += this.battleTextPosition % 3 !== 1 ? 12 : -4;
            else
                x += 4;
        }
        this.battleText.push({ x, y, text, colour, age: 0 });
    }
    setChat(message) {
        this.chatMessage = message;
        this.chatTime = 0;
    }
    update(dt) {
        if (this.moving) {
            this.pixelX += dt * this.moveSpeedX;
            this.pixelY += dt * this.moveSpeedY;
            const tx = this.tileX * TILE_SIZE;
            const ty = this.tileY * TILE_SIZE;
            if ((this.moveSpeedX < 0 && this.pixelX <= tx) || (this.moveSpeedX > 0 && this.pixelX >= tx) ||
                (this.moveSpeedY < 0 && this.pixelY <= ty) || (this.moveSpeedY > 0 && this.pixelY >= ty)) {
                this.moving = false;
                this.pixelX = tx;
                this.pixelY = ty;
                this.moveSpeedX = 0;
                this.moveSpeedY = 0;
                this.updateAnimations();
            }
        }
        // All slots animate in lock step (Animation.Update with the same interval per set).
        if (this.moving || this.attacking) {
            const body = this.slots[Slot.Body];
            const spf = body?.secondsPerFrame ?? 0.1;
            this.frameTime += dt;
            while (this.frameTime > spf) {
                this.frameTime -= spf;
                this.frameIndex++;
                // The swing plays once, then the character goes back to standing (OnAttackAnimationFinished).
                if (this.attacking && this.frameIndex >= (body?.frames.length ?? 1)) {
                    this.attacking = false;
                    this.updateAnimations();
                    break;
                }
            }
        }
        if (this.showBars) {
            this.barsTime += dt;
            if (this.barsTime >= 2)
                this.showBars = false;
        }
        for (const bt of this.battleText) {
            bt.age += dt;
            bt.y -= 32 * dt;
        }
        this.battleText = this.battleText.filter((bt) => bt.age < 1);
        this.spell?.update(dt);
        if (this.spell?.done)
            this.spell = null;
        this.emote?.update(dt);
        if (this.emote?.done)
            this.emote = null;
        if (this.chatMessage !== null) {
            this.chatTime += dt;
            if (this.chatTime >= 3)
                this.setChat(null);
        }
    }
    updateAnimations() {
        const a = this.appearance;
        const eq = a.equipment;
        const tint = (i) => (eq[i][0] === 0 || eq[i][4] === 0 ? null : [eq[i][1], eq[i][2], eq[i][3], eq[i][4]]);
        this.setSlot(Slot.Body, a.bodyId, AnimationType.Body, null);
        this.setSlot(Slot.Face, a.faceId, AnimationType.Hair, null);
        this.setSlot(Slot.Hair, a.hairId, AnimationType.Hair, a.hair);
        this.setSlot(Slot.Chest, eq[0][0], AnimationType.Chest, tint(0));
        this.setSlot(Slot.Head, eq[1][0], AnimationType.Helm, tint(1));
        this.setSlot(Slot.Legs, eq[2][0], AnimationType.Legs, tint(2));
        this.setSlot(Slot.Feet, eq[3][0], AnimationType.Feet, tint(3));
        this.setSlot(Slot.Shield, eq[4][0], AnimationType.Hand, tint(4));
        this.setSlot(Slot.Weapon, eq[5][0], AnimationType.Hand, tint(5));
        // Animation.SetAnimating resets to the first frame.
        this.frameIndex = 0;
        this.frameTime = 0;
    }
    setSlot(slot, id, type, tint) {
        const bodyId = this.appearance.bodyId;
        // Monsters (body >= 100) are a single body graphic.
        if ((bodyId >= 100 && slot !== Slot.Body) || id === 0) {
            this.slots[slot] = null;
            return;
        }
        const compiled = this.assets.compiledAnimation(type, id);
        if (!compiled) {
            this.slots[slot] = null;
            return;
        }
        const bodyState = bodyId >= 100 ? 1 : this.appearance.bodyState;
        const index = (this.attacking ? 16 : 0) + (bodyState - 1) + this.facing * 4;
        if (index < 0 || index >= compiled.length)
            return;
        const animation = this.assets.animation(compiled[index]);
        if (!animation || animation.frames.length === 0) {
            this.slots[slot] = null;
            return;
        }
        this.slots[slot] = {
            frames: animation.frames,
            secondsPerFrame: animation.secondsPerFrame,
            tint: tint && tint[3] > 0 ? tint : null,
        };
    }
    currentFrame(slot) {
        return slot.frames[this.frameIndex % slot.frames.length];
    }
    /** Width/height/offset of the body frame, used to place names and bubbles. */
    bodyBox() {
        const body = this.slots[Slot.Body];
        const info = body ? this.assets.frame(this.currentFrame(body)) : undefined;
        if (!info)
            return { x: 0, y: -16, w: TILE_SIZE, h: 48 };
        const [ox, oy] = frameOffset(info.w, info.h, "character");
        return { x: ox, y: oy, w: info.w, h: info.h };
    }
    render(ctx, cameraX, cameraY) {
        const x = Math.trunc(this.pixelX) - cameraX;
        const y = Math.trunc(this.pixelY) - cameraY;
        const draw = (slot) => {
            const anim = this.slots[slot];
            if (!anim)
                return;
            const frameId = this.currentFrame(anim);
            const d = this.assets.drawable(frameId, anim.tint);
            if (!d)
                return;
            const [ox, oy] = frameOffset(d.w, d.h, "character");
            ctx.drawImage(d.source, d.sx, d.sy, d.w, d.h, x + ox, y + oy, d.w, d.h);
        };
        const drawBodyLayers = () => {
            for (let i = 0; i < SLOT_COUNT - 2; i++)
                draw(i);
        };
        // Same order as Character.Render so weapons/shields sit in front of or behind the body.
        switch (this.facing) {
            case Direction.Right:
                draw(Slot.Shield);
                drawBodyLayers();
                draw(Slot.Weapon);
                break;
            case Direction.Up:
                draw(Slot.Shield);
                draw(Slot.Weapon);
                drawBodyLayers();
                break;
            case Direction.Down:
                for (let i = 0; i < SLOT_COUNT; i++)
                    draw(i);
                break;
            case Direction.Left:
                draw(Slot.Weapon);
                drawBodyLayers();
                draw(Slot.Shield);
                break;
        }
        if (this.spell)
            this.drawOneShot(ctx, this.spell, x, y, "spell");
        if (this.emote) {
            // Above the head, right of centre (Character.RenderEmote).
            const box = this.bodyBox();
            const info = this.assets.frame(this.emote.frame);
            if (info) {
                const d = this.assets.drawable(this.emote.frame, null);
                const [ox, oy] = frameOffset(info.w, info.h, "character");
                if (d)
                    ctx.drawImage(d.source, d.sx, d.sy, d.w, d.h, x + box.x + box.w - Math.trunc(info.w / 2) + ox, y + box.y - Math.trunc(info.h / 2) - 4 + oy, d.w, d.h);
            }
        }
    }
    drawOneShot(ctx, anim, x, y, kind) {
        const d = this.assets.drawable(anim.frame, null);
        if (!d)
            return;
        const [ox, oy] = frameOffset(d.w, d.h, kind);
        ctx.drawImage(d.source, d.sx, d.sy, d.w, d.h, x + ox, y + oy, d.w, d.h);
    }
}
function clampFacing(f) {
    return f >= 0 && f <= 3 ? f : Direction.Down;
}
