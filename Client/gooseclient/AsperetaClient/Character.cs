using System;
using System.Collections.Generic;
using System.Linq;
using SDL2;

namespace AsperetaClient
{
    public enum Direction
    {
        Up,
        Right,
        Down,
        Left
    }

    public class BattleTextLine
    {
        public double X { get; set; }
        public double Y { get; set; }
        public string Text { get; set; }
        public Colour Colour { get; set; }
        public double AliveTime { get; set; }

        public void Update(double dt)
        {
            const int SPEED = 32; // pixels per second

            AliveTime += dt;
            Y -= SPEED * dt;
        }

        public void Render(int xOffset, int yOffset)
        {
            GameClient.FontRenderer.RenderText(Text, (int)X + xOffset + 1, (int)Y + yOffset + 1, Colour.Black);
            GameClient.FontRenderer.RenderText(Text, (int)X + xOffset, (int)Y + yOffset, Colour);
        }
    }

    public class Character
    {
        public int LoginId { get; set; }

        public string Title { get; set; }
        public string Name { get; set; }
        public string Surname { get; set; }

        public int TileX { get; set; }
        public int TileY { get; set; }

        public double PixelX { get; set; }
        public double PixelY { get; set; }

        public int PixelXi { get { return (int)PixelX; } }
        public int PixelYi { get { return (int)PixelY; } }

        public int[][] DisplayedEquipment { get; set; }

        public int BodyState { get; set; }

        public int BodyId { get; set; }

        private Direction facing;
        public Direction Facing
        { 
            get { return facing; }
            set
            {
                if (facing != value)
                {
                    facing = value;
                    UpdateAnimations();
                }
            }
        }

        public Animation[] EquippedAnimations { get; set; }

        public Animation SpellAnimation { get; set; }

        public Animation EmoteAnimation { get; set; }

        public int MoveSpeed { get; set; } = 400; // This is an illutia move speed value. I think this is milliseconds per tile? Default illutia is 320.

        
        public int FaceId { get; set; }

        public int HairId { get; set; }
        public Colour HairColour { get; set; }

        public int HPPercentage { get; set; }
        public int MPPercentage { get; set; }
        public bool ShouldRenderHPMPBars { get; set; }
        public double RenderHPMPBarsTime { get; set; }

        public Colour NameColour { get; set; }



        public bool Moving { get; set; }

        public bool Attacking { get; set; }


        public double MoveSpeedX { get; set; }

        public double MoveSpeedY { get; set; }

        public List<BattleTextLine> BattleText { get; set; } = new List<BattleTextLine>();
        private int battleTextPosition = 0;

        private string chatMessage = null;
        private double chatDisplayedTime = 0;

        public event Action<Character> MovementFinished;

        public bool Erased { get; set; } = false;

        public Character(MakeCharacterPacket p)
        {
            this.Moving = false;
            this.Attacking = false;

            this.LoginId = p.LoginId;
            this.Title = p.Title;
            this.Name = p.Name;
            this.Surname = p.Surname;
            this.TileX = p.MapX;
            this.TileY = p.MapY;
            this.PixelX = this.TileX * Constants.TileSize;
            this.PixelY = this.TileY * Constants.TileSize;
            this.BodyId = p.BodyId;
            this.BodyState = p.BodyState;
            this.facing = (Direction)p.Facing;
            this.FaceId = p.FaceId;
            this.HairId = p.HairId;
            this.HairColour = new Colour(p.HairR, p.HairG, p.HairB, p.HairA);
            this.HPPercentage = p.HPPercent;
            this.MPPercentage = 0;
            this.NameColour = Colour.White;

            this.ShouldRenderHPMPBars = true;
            this.RenderHPMPBarsTime = 0;

            this.DisplayedEquipment = p.DisplayedEquipment;
            this.EquippedAnimations = new Animation[9];

            this.UpdateAnimations();
        }

        public enum DrawAnimations
        {
            Body,
            Face,
            Feet,
            Legs,
            Chest,
            Hair,
            Head,
            Shield,
            Weapon
        }

        public void UpdateAnimation(int id, DrawAnimations slot, AnimationType type, Colour colour = null)
        {
            if (this.BodyId >= 100 && slot != DrawAnimations.Body)
            {
                this.EquippedAnimations[(int)slot] = null;
                return;
            }

            if (id == 0)
            {
                this.EquippedAnimations[(int)slot] = null;
                return;
            }

            var compiledAnimation = GameClient.ResourceManager.AdfManager.CompiledEnc.CompiledAnimations.FirstOrDefault(a => a.Id == id && a.Type == type);
            if (compiledAnimation == null)
            {
                //Console.WriteLine($"Couldn't find animation id {id} of type {type} for slot {slot}");
                this.EquippedAnimations[(int)slot] = null;
                return;
            }

            int attackOffset = (Attacking ? 16 : 0);
            int bodyState = (this.BodyId >= 100 ? 1 : this.BodyState);
            var animationIndex = attackOffset + (bodyState - 1) + ((int)this.Facing) * 4;
            if (animationIndex < 0 || animationIndex >= compiledAnimation.AnimationIndexes.Length)
            {
                Console.WriteLine($"UpdateAnimation for {id} {slot} {type} Attacking: {Attacking} BodyState: {bodyState}. Index: {animationIndex} Max Index: {compiledAnimation.AnimationIndexes.Length}");
                return;
            }

            var animationId = compiledAnimation.AnimationIndexes[animationIndex];
            var animation = GameClient.ResourceManager.GetAnimation(animationId, colour);
            if (animation == null)
            {
                this.EquippedAnimations[(int)slot] = null;
                return;
            }

            animation.SetAnimating(Moving | Attacking);
            animation.Colour = colour;
            if (Attacking)
            {
                animation.AnimationFinished += OnAttackAnimationFinished;
            }

            this.EquippedAnimations[(int)slot] = animation;
        }

        public void UpdateAnimations()
        {
            UpdateAnimation(this.BodyId, DrawAnimations.Body, AnimationType.Body);
            UpdateAnimation(this.FaceId, DrawAnimations.Face, AnimationType.Hair);
            UpdateAnimation(this.HairId, DrawAnimations.Hair, AnimationType.Hair, HairColour);
            UpdateAnimation(this.DisplayedEquipment[0][0], DrawAnimations.Chest, AnimationType.Chest, EquipmentColour(0));
            UpdateAnimation(this.DisplayedEquipment[1][0], DrawAnimations.Head, AnimationType.Helm, EquipmentColour(1));
            UpdateAnimation(this.DisplayedEquipment[2][0], DrawAnimations.Legs, AnimationType.Legs, EquipmentColour(2));
            UpdateAnimation(this.DisplayedEquipment[3][0], DrawAnimations.Feet, AnimationType.Feet, EquipmentColour(3));
            UpdateAnimation(this.DisplayedEquipment[4][0], DrawAnimations.Shield, AnimationType.Hand, EquipmentColour(4));
            UpdateAnimation(this.DisplayedEquipment[5][0], DrawAnimations.Weapon, AnimationType.Hand, EquipmentColour(5));
        }

        public void OnAttackAnimationFinished(Animation animation)
        {
            Attacking = false;
            this.UpdateAnimations();
        }

        public Colour EquipmentColour(int i)
        {
            var equip = this.DisplayedEquipment[i];
            if (equip[0] == 0 || equip[4] == 0)
                return null;

            return new Colour(equip[1], equip[2], equip[3], equip[4]);
        }

        public void Update(double dt)
        {
            if (Moving)
            {
                this.PixelX += (dt * MoveSpeedX);
                this.PixelY += (dt * MoveSpeedY);

                if ((MoveSpeedX < 0 && PixelX <= TileX * Constants.TileSize)
                    || (MoveSpeedX > 0 && PixelX >= TileX * Constants.TileSize)
                    || (MoveSpeedY < 0 && PixelY <= TileY * Constants.TileSize)
                    || (MoveSpeedY > 0 && PixelY >= TileY * Constants.TileSize)) {

                    Moving = false;
                    PixelX = TileX * Constants.TileSize;
                    PixelY = TileY * Constants.TileSize;
                    MoveSpeedX = 0;
                    MoveSpeedY = 0;

                    this.UpdateAnimations();

                    MovementFinished?.Invoke(this);
                }
            }

            foreach (var animation in this.EquippedAnimations)
            {
                animation?.Update(dt);
            }

            if (SpellAnimation != null)
            {
                SpellAnimation.Update(dt);
                if (SpellAnimation.Finished)
                    SpellAnimation = null;
            }

            if (EmoteAnimation != null)
            {
                EmoteAnimation.Update(dt);
                if (EmoteAnimation.Finished)
                    EmoteAnimation = null;
            }

            if (ShouldRenderHPMPBars)
            {
                RenderHPMPBarsTime += dt;

                if (RenderHPMPBarsTime >= 2)
                    ShouldRenderHPMPBars = false;
            }

            if (chatMessage != null)
            {
                chatDisplayedTime += dt;

                if (chatDisplayedTime >= 3)
                {
                    SetChat(null);
                }
            }

            UpdateBattleText(dt);
        }

        public void Render(int xOffset, int yOffset)
        {
            switch (Facing)
            {
                case Direction.Right:
                    EquippedAnimations[(int)DrawAnimations.Shield]?.Render(this.PixelXi - xOffset, this.PixelYi - yOffset);
                    for (int i = 0; i < EquippedAnimations.Length - 2; i++)
                    {
                        EquippedAnimations[i]?.Render(this.PixelXi - xOffset, this.PixelYi - yOffset);
                    }
                    EquippedAnimations[(int)DrawAnimations.Weapon]?.Render(this.PixelXi - xOffset, this.PixelYi - yOffset);
                    break;

                case Direction.Up:
                    EquippedAnimations[(int)DrawAnimations.Shield]?.Render(this.PixelXi - xOffset, this.PixelYi - yOffset);
                    EquippedAnimations[(int)DrawAnimations.Weapon]?.Render(this.PixelXi - xOffset, this.PixelYi - yOffset);
                    for (int i = 0; i < EquippedAnimations.Length - 2; i++)
                    {
                        EquippedAnimations[i]?.Render(this.PixelXi - xOffset, this.PixelYi - yOffset);
                    }
                    break;
                    
                case Direction.Down:
                    foreach (var animation in this.EquippedAnimations)
                    {
                        animation?.Render(this.PixelXi - xOffset, this.PixelYi - yOffset);
                    }
                    break;
                case Direction.Left:
                    EquippedAnimations[(int)DrawAnimations.Weapon]?.Render(this.PixelXi - xOffset, this.PixelYi - yOffset);
                    for (int i = 0; i < EquippedAnimations.Length - 2; i++)
                    {
                        EquippedAnimations[i]?.Render(this.PixelXi - xOffset, this.PixelYi - yOffset);
                    }
                    EquippedAnimations[(int)DrawAnimations.Shield]?.Render(this.PixelXi - xOffset, this.PixelYi - yOffset);
                    break;
            }

            SpellAnimation?.Render(this.PixelXi - xOffset, this.PixelYi - yOffset);
            RenderEmote(xOffset, yOffset);
        }

        public void RenderEmote(int xOffset, int yOffset)
        {
            if (EmoteAnimation == null) return;

            int x = (this.PixelXi - xOffset) + this.GetXOffset() + this.GetWidth() - EmoteAnimation.GetWidth() / 2;
            int y = this.PixelYi - yOffset + this.GetYOffset() - EmoteAnimation.GetHeight() / 2 - 4;

            EmoteAnimation.Render(x, y);
        }

        public void RenderName(int x_offset, int y_offset)
        {
            string name = (string.IsNullOrWhiteSpace(Title) ? "" : Title + " ") + Name + (string.IsNullOrWhiteSpace(Surname) ? "" : " " + Surname);
            int x = (this.PixelXi - x_offset) + this.GetXOffset() + this.GetWidth() / 2 - (name.Length * GameClient.FontRenderer.CharWidth) / 2;
            int y = this.PixelYi - y_offset + this.GetYOffset() - GameClient.FontRenderer.CharHeight - 7;

            GameClient.FontRenderer.RenderText(name, x + 1, y + 1, Colour.Black);
            GameClient.FontRenderer.RenderText(name, x, y, this.NameColour);
        }

        public void RenderHPMPBars(int x_offset, int y_offset)
        {
            if (!ShouldRenderHPMPBars) return;

            int BAR_LENGTH = this.GetWidth();
            const int HP_BAR_HEIGHT = 3;
            const int MP_BAR_HEIGHT = 2;

            int x = (this.PixelXi - x_offset) + this.GetXOffset() + this.GetWidth() / 2 - BAR_LENGTH / 2;
            int y = this.PixelYi - y_offset + this.GetYOffset() - 8;

            SDL.SDL_Rect rect;
            rect.x = x;
            rect.y = y;
            rect.w = BAR_LENGTH;
            rect.h = HP_BAR_HEIGHT;

            // hp bar background
            SDL.SDL_SetRenderDrawColor(GameClient.Renderer, 1, 1, 1, 255);
            SDL.SDL_RenderFillRect(GameClient.Renderer, ref rect);

            // hp bar
            rect.w = (int)(BAR_LENGTH * (HPPercentage / 100d));
            SDL.SDL_SetRenderDrawColor(GameClient.Renderer, 0, 252, 0, 255);
            SDL.SDL_RenderFillRect(GameClient.Renderer, ref rect);

            // mp bar
            rect.y = rect.y + HP_BAR_HEIGHT;
            rect.w = (int)(BAR_LENGTH * (MPPercentage / 100d));
            rect.h = MP_BAR_HEIGHT;
            SDL.SDL_SetRenderDrawColor(GameClient.Renderer, 0, 0, 248, 255);
            SDL.SDL_RenderFillRect(GameClient.Renderer, ref rect);
        }

        public void RenderBattleText(int xOffset, int yOffset)
        {
            foreach (var bt in BattleText)
            {
                bt.Render(this.PixelXi - xOffset, this.PixelYi - yOffset);
            }
        }

        public void RenderChat(int xOffset, int yOffset)
        {
            if (chatMessage == null) return;

            int maxW = 184;
            int padding = 5;

            var wrappedLines = GameClient.FontRenderer.WordWrap(chatMessage, maxW - padding * 2, "").ToArray();

            int messageWidth = chatMessage.Length * GameClient.FontRenderer.CharWidth;
            int bubbleWidth = Math.Min(maxW, messageWidth + padding * 2);
            int bubbleHeight = wrappedLines.Length * GameClient.FontRenderer.CharHeight + 5;

            int x = (this.PixelXi - xOffset) + this.GetXOffset() + this.GetWidth() / 2 - bubbleWidth / 2;
            int y = this.PixelYi - yOffset + this.GetYOffset() - bubbleHeight - 7;

            SDL.SDL_Rect rect;
            rect.x = x;
            rect.y = y;
            rect.w = bubbleWidth;
            rect.h = bubbleHeight;

            SDL.SDL_SetRenderDrawColor(GameClient.Renderer, Colour.ChatBackground.R, Colour.ChatBackground.G, Colour.ChatBackground.B, Colour.ChatBackground.A);
            SDL.SDL_RenderFillRect(GameClient.Renderer, ref rect);

            SDL.SDL_SetRenderDrawColor(GameClient.Renderer, Colour.ChatForeground.R, Colour.ChatForeground.G, Colour.ChatForeground.B, Colour.ChatForeground.A);
            SDL.SDL_RenderDrawRect(GameClient.Renderer, ref rect);

            for (int i = 0; i < wrappedLines.Length; i++)
            {
                GameClient.FontRenderer.RenderText(wrappedLines[i], x + padding, y + (i * GameClient.FontRenderer.CharHeight) + 3, Colour.White);
            }
        }

        public void AddBattleText(BattleTextType type, string text)
        {
            if (BattleText.Count == 18) return;

            var colour = Colour.White;
            bool spread = false;

            switch (type)
            {
                case BattleTextType.Red1:
                case BattleTextType.Red2:
                case BattleTextType.Red4:
                case BattleTextType.Red5:
                    colour = Colour.Red;
                    spread = true;
                    break;
                case BattleTextType.Green7:
                case BattleTextType.Green8:
                    colour = Colour.Green;
                    spread = true;
                    break;
                case BattleTextType.Stunned10:
                case BattleTextType.Stunned50:
                    text = "STUNNED";
                    break;
                case BattleTextType.Rooted11:
                case BattleTextType.Rooted51:
                    text = "ROOTED";
                    break;
                case BattleTextType.Dodge20:
                    text = "DODGE";
                    break;
                case BattleTextType.Miss21:
                    text = "MISS";
                    break;
                case BattleTextType.Yellow60:
                    colour = Colour.Yellow;
                    break;
                case BattleTextType.Red61:
                    colour = Colour.Red;
                    break;
            }

            int x = this.GetXOffset() + this.GetWidth() / 2 - (text.Length * GameClient.FontRenderer.CharWidth) / 2;
            int y = this.GetYOffset();
            if (!spread)
            {
                y += this.GetHeight() / 2;
            }
            else
            {
                if (BattleText.Count != 0)
                {
                    this.battleTextPosition = (this.battleTextPosition + 1) % 9;
                }
                else
                {
                    this.battleTextPosition = 0;
                }

                y += Math.Min(BattleText.Count / 3, 2) * 8;

                if (this.battleTextPosition % 3 != 0)
                {
                    x += (this.battleTextPosition % 3 != 1 ? 12 : -4);
                }
                else
                {
                    x += 4;
                }
            }

            BattleText.Add(new BattleTextLine() { X = x, Y = y, Colour = colour, Text = text });
        }

        public void UpdateBattleText(double dt)
        {
            for (int i = 0; i < BattleText.Count; i++)
            {
                var bt = BattleText[i];

                bt.Update(dt);

                if (bt.AliveTime >= 1)
                {
                    BattleText.RemoveAt(i);
                    i--;
                }
            }
        }

        public int GetWidth()
        {
            return this.EquippedAnimations[0]?.GetWidth() ?? 32;
        }

        public int GetHeight()
        {
            return this.EquippedAnimations[0]?.GetHeight() ?? 32;
        }

        public int GetXOffset()
        {
            return this.EquippedAnimations[0]?.GetXOffset() ?? 32;
        }

        public int GetYOffset()
        {
            return this.EquippedAnimations[0]?.GetYOffset() ?? 32;
        }

        public void MoveTo(int destX, int destY)
        {
            Moving = true;
            MoveSpeedX = 0;
            MoveSpeedY = 0;
            Attacking = false;

            if (destY < TileY)
            {
                Facing = Direction.Up;
                MoveSpeedY = (-1000d * Constants.TileSize) / MoveSpeed;
            }
            else if (destX > TileX)
            {
                Facing = Direction.Right;
                MoveSpeedX = (1000d * Constants.TileSize) / MoveSpeed;
            }
            else if (destY > TileY)
            {
                Facing = Direction.Down;
                MoveSpeedY = (1000d * Constants.TileSize) / MoveSpeed;
            }
            else if (destX < TileX)
            {
                Facing = Direction.Left;
                MoveSpeedX = (-1000d * Constants.TileSize) / MoveSpeed;
            }

            TileX = destX;
            TileY = destY;

            this.UpdateAnimations();
        }

        public void SetPosition(int tileX, int tileY)
        {
            TileX = tileX;
            TileY = tileY;
            Moving = false;
            PixelX = TileX * Constants.TileSize;
            PixelY = TileY * Constants.TileSize;
            MoveSpeedX = 0;
            MoveSpeedY = 0;

            this.UpdateAnimations();
        }

        public void UpdateCharacter(UpdateCharacterPacket p)
        {
            this.BodyId = p.BodyId;
            this.BodyState = p.BodyState;
            this.FaceId = p.FaceId;
            this.HairId = p.HairId;
            this.HairColour = new Colour(p.HairR, p.HairG, p.HairB, p.HairA);

            this.DisplayedEquipment = p.DisplayedEquipment;

            this.UpdateAnimations();
        }

        public void Attack()
        {
            Attacking = true;

            this.UpdateAnimations();
        }

        public void SetChat(string message)
        {
            chatMessage = message;
            chatDisplayedTime = 0;
        }
    }
}