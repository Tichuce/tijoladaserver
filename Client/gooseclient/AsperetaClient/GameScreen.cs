using System;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using SDL2;

namespace AsperetaClient
{
    public class GameScreen : State
    {
        private int mapNumber;
        private string mapName;
        public Map Map { get; set; }

        private Character player;

        private bool moveKeyDown = false;
        private Direction moveKeyDirection = Direction.Down;
        private double moveKeyPressedTime = 0;

        private bool moveDelay = false;
        private double moveDelayElapsedTime = 0;
        private double attackElapsedTime = 0;
        private bool attacking = false;
        private double weaponSpeed = 1;

        private RootPanel uiRoot;

        private bool AutoPickup { get; set; } = false;
        public bool ShowBlockedTiles { get; private set; } = false;

        public ChatWindow ChatWindow { get; set; }

        private int mouseX;
        private int mouseY;

        public ScriptsWindow ScriptsWindow { get; private set; }

        public AutoHuntTracker AutoHunt { get; private set; }

        private long lastAutoHuntStep = 0;

        public GameScreen(int mapNumber, string mapName)
        {
            this.mapNumber = mapNumber;
            this.mapName = mapName;

            SetChatBubbleColours();
            SetGooseSettings();

            AutoHunt = new AutoHuntTracker();
            
            GameClient.NetworkClient.PacketManager.Listen<SetYourCharacterPacket>(OnSetYourCharacter);
            GameClient.NetworkClient.PacketManager.Listen<SetYourPositionPacket>(OnSetYourPosition);
            GameClient.NetworkClient.PacketManager.Listen<SendCurrentMapPacket>(OnSendCurrentMap);
            GameClient.NetworkClient.PacketManager.Listen<SendMapNamePacket>(OnSendMapName);
            GameClient.NetworkClient.PacketManager.Listen<WeaponSpeedPacket>(OnWeaponSpeed);
            GameClient.NetworkClient.PacketManager.Listen<MakeWindowPacket>(OnMakeWindow);
            GameClient.NetworkClient.PacketManager.Listen<EndWindowPacket>(OnEndWindow);
        }

        public override void Resuming()
        {
            GameClient.ScreenWidth = GameClient.GameScreenWidth;
            GameClient.ScreenHeight = GameClient.GameScreenHeight;
            SDL.SDL_RenderSetLogicalSize(GameClient.Renderer, GameClient.ScreenWidth, GameClient.ScreenHeight);

            GameClient.ViewRangeX = GameClient.ScreenWidth / Constants.TileSize / 2;
            GameClient.ViewRangeY = GameClient.ScreenHeight / Constants.TileSize / 2;
        }

        public override void Starting()
        {
            Resuming();

            CreateGui();

            GameClient.ScriptManager.OnGameScreenCreated(this);

            LoadMap();
        }

        public void LoadMap()
        {
            GameClient.StateManager.AppendState(new MapLoadingScreen(mapNumber, mapName, this));
        }

        public void CreateGui()
        {
            this.uiRoot = new RootPanel();
            this.uiRoot.DropWasUnhandled += OnDropWasUnhandled;
            this.uiRoot.RightClickUnhandled += OnRightClick;
            this.uiRoot.DoubleClickUnhandled += OnDoubleClick;

            ChatWindow = new ChatWindow();
            ChatWindow.CommandHandlers["/autopickup"] = OnAutoPickupCommand;
            ChatWindow.CommandHandlers["/showblockedtiles"] = OnShowBlockedTilesCommand;

            this.uiRoot.AddChild(ChatWindow);
            this.uiRoot.AddChild(new FpsWindow());
            this.uiRoot.AddChild(new BuffBarWindow());
            this.uiRoot.AddChild(new HPBarWindow());
            this.uiRoot.AddChild(new MPBarWindow());
            this.uiRoot.AddChild(new SPBarWindow());
            this.uiRoot.AddChild(new XPBarWindow());
            this.uiRoot.AddChild(new PartyWindow());
            this.uiRoot.AddChild(new ButtonBarWindow());
            this.uiRoot.AddChild(new DestroyButtonWindow());

            this.uiRoot.AddChild(new CharacterWindow());

            var spellbookWindow = new SpellbookWindow();
            spellbookWindow.CastSpell += (slot) => { Map.OnCastSpell(slot); };
            this.uiRoot.AddChild(spellbookWindow);

            this.uiRoot.AddChild(new InventoryWindow());

            this.ScriptsWindow = new ScriptsWindow();
            this.uiRoot.AddChild(ScriptsWindow);

            this.uiRoot.AddChild(new AutoHuntWindow(AutoHunt));

            // This needs to be added last since it has to take the slots from character/spellbook/inventory
            this.uiRoot.AddChild(new HotkeyBarWindow());
        }

        private void SetChatBubbleColours()
        {
            if (GameClient.UserSettings.Sections.ContainsKey("Bubble"))
            {
                Colour.ChatBackground = GameClient.ParseColour(GameClient.UserSettings.Sections["Bubble"]["Background"]);
                Colour.ChatForeground = GameClient.ParseColour(GameClient.UserSettings.Sections["Bubble"]["Foreground"]);
            }
        }

        private void SetGooseSettings()
        {
            this.AutoPickup = GameClient.UserSettings.GetBool("GooseSettings", "AutoPickup", false);
        }

        private void OnAutoPickupCommand(string command, string arguments)
        {
            if (this.AutoPickup)
                this.player.MovementFinished -= this.OnOurCharacterMoved;
                
            this.AutoPickup = !this.AutoPickup;

            if (this.AutoPickup)
                this.player.MovementFinished += this.OnOurCharacterMoved;

            ChatWindow.AddText(ChatType.Client, $"Automatic item pickup is now {(this.AutoPickup ? "enabled" : "disabled")}.");
        }

        private void OnShowBlockedTilesCommand(string command, string arguments)
        {
            this.ShowBlockedTiles = !this.ShowBlockedTiles;

            ChatWindow.AddText(ChatType.Client, $"Blocked tiles are now {(this.ShowBlockedTiles ? "visible" : "hidden")}.");
        }

        private int RenderOffsetX()
        {
            int half_x = GameClient.ScreenWidth / 2 - Constants.TileSize / 2;
            int start_x = player != null ? player.PixelXi - half_x : 0;

            return start_x;
        }

        private int RenderOffsetY()
        {
            int half_y = GameClient.ScreenHeight / 2 - Constants.TileSize;
            int start_y = player != null ? player.PixelYi - half_y : 0;

            return start_y;
        }
        
        public override void Render(double dt)
        {
            int start_x = RenderOffsetX();
            int start_y = RenderOffsetY();

            Map.Render(start_x, start_y);
            this.uiRoot.Render(dt, 0, 0);
        }

        public override void Update(double dt)
        {
            var keysPtr = SDL.SDL_GetKeyboardState(out int keysLength);
            byte[] keys = new byte[keysLength];
            Marshal.Copy(keysPtr, keys, 0, keysLength);

            if (!Map.Targeting && uiRoot.FocusedTextBox == null)
            {
                if (keys[GameClient.KeyMap.MoveUp] == 1)
                {
                    MoveKeyPressed(Direction.Up);
                }
                else if (keys[GameClient.KeyMap.MoveRight] == 1)
                {
                    MoveKeyPressed(Direction.Right);
                }
                else if (keys[GameClient.KeyMap.MoveDown] == 1)
                {
                    MoveKeyPressed(Direction.Down);
                }
                else if (keys[GameClient.KeyMap.MoveLeft] == 1)
                {
                    MoveKeyPressed(Direction.Left);
                }
                else
                {
                    moveKeyDown = false;
                    moveKeyPressedTime = 0;
                }

                if (keys[GameClient.KeyMap.Attack] == 1)
                {
                    AttackKeyPressed();
                }
            }

            this.Map.Update(dt);

            if (moveKeyDown)
            {
                moveKeyPressedTime += dt;
            }

            if (moveDelay)
            {
                moveDelayElapsedTime += dt;

                if (moveDelayElapsedTime >= 0.2)
                {
                    moveDelay = false;
                    moveDelayElapsedTime = 0;
                }
            }

            if (attacking)
            {
                attackElapsedTime += dt;

                if (attackElapsedTime >= weaponSpeed)
                {
                    attackElapsedTime = 0;
                    attacking = false;
                }
            }

            this.uiRoot.Update(dt);

            bool mouseOverWindow = false;
            foreach (var element in this.uiRoot.Children.Where(c => c is BaseWindow).Cast<BaseWindow>())
            {
                if (!element.Hidden && element.Contains(0, 0, mouseX, mouseY))
                {
                    mouseOverWindow = true;
                    break;
                }
            }

            if (!mouseOverWindow)
            {
                OnMouseOverMap(mouseX, mouseY);
            }
        }

        public override void HandleEvent(SDL.SDL_Event ev)
        {
            bool preventFurtherEvents = this.Map.HandleEvent(ev);
            if (preventFurtherEvents)
                return;

            this.uiRoot.HandleEvent(ev, 0, 0);

            switch (ev.type)
            {
                case SDL.SDL_EventType.SDL_QUIT:
                    SaveUserSettings();
                    break;

                case SDL.SDL_EventType.SDL_MOUSEMOTION:
                    mouseX = ev.motion.x;
                    mouseY = ev.motion.y;
                    break;

                case SDL.SDL_EventType.SDL_KEYDOWN:
                    if (Map.Targeting || uiRoot.FocusedTextBox != null) return;
                    if ((SDL.SDL_GetModState() & SDL.SDL_Keymod.KMOD_SHIFT) == SDL.SDL_Keymod.KMOD_NONE) return;

                    if (ev.key.keysym.sym >= SDL.SDL_Keycode.SDLK_0 && ev.key.keysym.sym <= SDL.SDL_Keycode.SDLK_9)
                    {
                        int emoteId = 0;

                        switch (ev.key.keysym.sym)
                        {
                            case SDL.SDL_Keycode.SDLK_1: emoteId = 1; break;
                            case SDL.SDL_Keycode.SDLK_2: emoteId = 2; break;
                            case SDL.SDL_Keycode.SDLK_3: emoteId = 4; break;
                            case SDL.SDL_Keycode.SDLK_4: emoteId = 5; break;
                            case SDL.SDL_Keycode.SDLK_5: emoteId = 6; break;
                            case SDL.SDL_Keycode.SDLK_6: emoteId = 7; break;
                            case SDL.SDL_Keycode.SDLK_7: emoteId = 8; break;
                            case SDL.SDL_Keycode.SDLK_8: emoteId = 9; break;
                            case SDL.SDL_Keycode.SDLK_9: emoteId = 10; break;
                            case SDL.SDL_Keycode.SDLK_0: emoteId = 12; break;
                        }

                        GameClient.NetworkClient.Emote(emoteId);
                        return;
                    }
                    break;
            }
        }

        public void SaveUserSettings()
        {
            GameClient.UserSettings.SetValue<bool>("GooseSettings", "AutoPickup", this.AutoPickup);

            foreach (var window in uiRoot.Children.Where(g => g is BaseWindow).Cast<BaseWindow>())
            {
                window.SaveState();
            }

            GameClient.GameSettings.SaveFile();
            GameClient.UserSettings.SaveFile();
        }

        public void AttackKeyPressed()
        {
            if (attacking) return;

            attacking = true;
            attackElapsedTime = 0;

            player.Attack();
            GameClient.NetworkClient.Attack();
        }

        public bool CanMove()
        {
            return !this.uiRoot.Children.Any(c => c is VendorWindow);
        }

        public void MoveKeyPressed(Direction direction)
        {
            if (player == null || player.Moving || moveDelay) return;
            if (!CanMove()) return;

            bool delay = true;
            if (!moveKeyDown || moveKeyDirection != direction)
            {
                moveKeyDown = true;
                moveKeyDirection = direction;
                moveKeyPressedTime = 0;

                if (player.Facing != direction)
                {
                    player.Facing = direction;
                    GameClient.NetworkClient.Facing(direction);
                    return;
                }
                else
                {
                    delay = false;
                }
            }

            if (delay && moveKeyPressedTime < 0.1) return;

            int destX = player.TileX;
            int destY = player.TileY;

            switch (direction)
            {
                case Direction.Up:
                    destY -= 1;
                    break;
                case Direction.Right:
                    destX += 1;
                    break;
                case Direction.Down:
                    destY += 1;
                    break;
                case Direction.Left:
                    destX -= 1;
                    break;
            }

            if (Map.CanMoveTo(destX, destY))
            {
                Map.MoveCharacter(player, destX, destY);
                GameClient.NetworkClient.Move(direction);
            }
        }

        public void OnSetYourCharacter(object packet)
        {
            var p = (SetYourCharacterPacket)packet;

            if (this.player != null && this.AutoPickup)
            {
                this.player.MovementFinished -= this.OnOurCharacterMoved;
            }

            this.player = this.Map.Characters.FirstOrDefault(c => c.LoginId == p.LoginId);

            if (this.AutoPickup)
                this.player.MovementFinished += this.OnOurCharacterMoved;

            this.uiRoot.Player = this.player;
        }

        public void OnSendCurrentMap(object packet)
        {
            var sendCurrentMapPacket = (SendCurrentMapPacket)packet;
            this.mapNumber = sendCurrentMapPacket.MapNumber;
            this.mapName = sendCurrentMapPacket.MapName;
            LoadMap();
        }

        public void OnSendMapName(object packet)
        {
            // Do nothing, hides the message "Can't handle packet"
        }

        public void OnSetYourPosition(object packet)
        {
            var p = (SetYourPositionPacket)packet;

            // The server sends each auto-hunt step as a position update. Walk one-tile steps like a
            // normal move instead of jumping; anything else (corrections, warps) still snaps.
            if (AutoHunt.State == AutoHuntState.On && Map.ValidTile(p.MapX, p.MapY) &&
                Math.Abs(p.MapX - player.TileX) + Math.Abs(p.MapY - player.TileY) == 1)
            {
                WalkAutoHuntStep(p.MapX, p.MapY);
                return;
            }

            if (Map[player.TileX, player.TileY].Character == player)
                Map[player.TileX, player.TileY].Character = null;

            player.SetPosition(p.MapX, p.MapY);
            Map[player.TileX, player.TileY].Character = player;
            moveDelay = true;
        }

        // Times the walk to the server's step rate (capped at normal walking speed) so the character
        // doesn't fall behind the server, or overshoot it, on long chases.
        private void WalkAutoHuntStep(int x, int y)
        {
            long now = Stopwatch.GetTimestamp();
            double sinceLast = (now - lastAutoHuntStep) * 1000d / Stopwatch.Frequency;
            lastAutoHuntStep = now;

            int normalSpeed = player.MoveSpeed;
            if (sinceLast < normalSpeed)
                player.MoveSpeed = (int)Math.Max(200, sinceLast);

            Map.MoveCharacter(player, x, y);
            player.MoveSpeed = normalSpeed;
        }

        public void OnWeaponSpeed(object packet)
        {
            var p = (WeaponSpeedPacket)packet;

            weaponSpeed = p.Speed / 1000d;
        }

        public void OnDropWasUnhandled(object dropData)
        {
            if (dropData is ItemSlot)
            {
                var fromSlot = dropData as ItemSlot;

                if (fromSlot.Parent is CharacterWindow)
                {
                    fromSlot.Use();
                }
                else if (fromSlot.Parent is InventoryWindow)
                {
                    GameClient.NetworkClient.DropItem(fromSlot.SlotNumber, fromSlot.StackSize);
                }
            }
        }

        public void OnRightClick(int x, int y)
        {
            int startX = RenderOffsetX();
            int startY = RenderOffsetY();

            Map.OnRightClick(startX, startY, x, y);
        }

        public void OnDoubleClick(int x, int y)
        {
            int startX = RenderOffsetX();
            int startY = RenderOffsetY();

            Map.OnDoubleClick(startX, startY, x, y);
        }

        public void OnMouseOverMap(int x, int y)
        {
            int startX = RenderOffsetX();
            int startY = RenderOffsetY();

            Map.OnMouseOverMap(startX, startY, x, y);
        }

        public void OnMakeWindow(object packet)
        {
            var p = (MakeWindowPacket)packet;

            var existingWindow = this.uiRoot.Children.FirstOrDefault(c => c is BaseWindow && ((BaseWindow)c).WindowId == p.WindowId);
            if (existingWindow != null)
            {
                this.uiRoot.RemoveChild(existingWindow);
            }
            
            switch (p.WindowFrame)
            {
                case WindowFrames.Vendor:
                    this.uiRoot.AddChild(new VendorWindow(p));
                    break;
                case WindowFrames.GenericInfo:
                    this.uiRoot.AddChild(new GenericInfoWindow(p));
                    break;
                case WindowFrames.Quest:
                    this.uiRoot.AddChild(new QuestWindow(p));
                    break;
                case WindowFrames.TwoSlot:
                    this.uiRoot.AddChild(new ContainerWindow(p, "Container2"));
                    break;
                case WindowFrames.FourSlot:
                    this.uiRoot.AddChild(new ContainerWindow(p, "Container4"));
                    break;
                case WindowFrames.SixSlot:
                    this.uiRoot.AddChild(new ContainerWindow(p, "Container6"));
                    break;
                case WindowFrames.EightSlot:
                    this.uiRoot.AddChild(new ContainerWindow(p, "Container8"));
                    break;
                case WindowFrames.TenSlot:
                    this.uiRoot.AddChild(new ContainerWindow(p, "Container10"));
                    break;
            }
        }

        public void OnEndWindow(object packet)
        {
            var p = (EndWindowPacket)packet;

            var window = this.uiRoot.Children.Where(w => w is BaseWindow).Cast<BaseWindow>()
                .FirstOrDefault(w => w.WindowId == p.WindowId);

            window?.EndWindow();
        }

        public void OnOurCharacterMoved(Character c)
        {
            if (this.Map[c.TileX, c.TileY].MapObject != null)
                GameClient.NetworkClient.Get();
        }

        public BaseWindow FindWindow(string name)
        {
            return this.uiRoot.Children.Where(w => w is BaseWindow).Cast<BaseWindow>().FirstOrDefault(w => w.Name == name);
        }
    }
}