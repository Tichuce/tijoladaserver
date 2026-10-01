using System;
using System.Linq;
using System.Runtime.InteropServices;
using SDL2;

namespace AsperetaClient
{
    public class BaseWindow : BaseContainer
    {
        public int WindowId { get; set; }

        public string Name { get; private set; }

        public string Title { get; set; }

        public int NpcId { get; set; }

        public bool Hidden { get; set; } = false;

        protected Texture background;

        private int focusAlpha;
        private int unfocusAlpha;

        private bool mouseDown = false;
        private int lastMouseDragX = 0;
        private int lastMouseDragY = 0;

        protected int rows;
        protected int columns;
        protected int objoffX;
        protected int objoffY;
        protected int objW;
        protected int objH;

        protected bool createdByServer = false;

        protected int unknownId1;
        protected int unknownId2;

        protected Label titleLabel;

        protected SDL.SDL_Keycode hideShortcutKey = 0;

        public BaseWindow(string windowName)
        {
            this.Name = windowName;

            background = GameClient.ResourceManager.GetTexture($"skins/{GameClient.GameSettings["INIT"]["Skin"]}/{GameClient.WindowSettings[windowName]["image"]}");

            int winX = 0;
            int winY = 0;
            bool centered = false;

            if (GameClient.UserSettings.Sections.ContainsKey(windowName))
            {
                var winloc = GameClient.UserSettings.GetCoords(windowName, "winloc");
                winX = winloc.ElementAt(0);
                winY = winloc.ElementAt(1);
            }
            else
            {
                centered = true;
            }

            SDL.SDL_Rect rect;
            rect.x = winX;
            rect.y = winY;
            rect.w = background.W;
            rect.h = background.H;

            this.Rect = rect;

            if (centered)
            {
                this.Rect.x = CenterH(this.Rect.w);
                this.Rect.y = CenterV(this.Rect.h);
            }

            this.HasFocus = false;
            this.ZIndex = -1;

            if (GameClient.UserSettings.Sections.ContainsKey(windowName))
                Hidden = GameClient.UserSettings[windowName]["startup"] == "0";
            else
                Hidden = true;

            var alphas = GameClient.WindowSettings.GetCoords(windowName, "focus");
            unfocusAlpha = alphas.ElementAt(0);
            focusAlpha = alphas.ElementAt(1);

            var windim = GameClient.WindowSettings.GetCoords(this.Name, "windim");
            rows = windim.ElementAt(0);
            columns = windim.ElementAt(1);

            var objoff = GameClient.WindowSettings.GetCoords(this.Name, "objoff");

            objoffX = objoff.ElementAt(0);
            objoffY = objoff.ElementAt(1);

            var objdim = GameClient.WindowSettings.GetCoords(this.Name, "objdim");
            objW = objdim.ElementAt(0);
            objH = objdim.ElementAt(1);

            if (GameClient.WindowSettings.Sections[this.Name].ContainsKey("cboff"))
            {
                var cboff = GameClient.WindowSettings.GetCoords(this.Name, "cboff");
                var cbdim = GameClient.WindowSettings.GetCoords(this.Name, "cbdim");
                var closeButton = new Button(cboff.ElementAt(0), cboff.ElementAt(1), cbdim.ElementAt(0), cbdim.ElementAt(1));
                closeButton.Clicked += OnCloseButtonClicked;
                this.AddChild(closeButton);
            }

            if (GameClient.WindowSettings.Sections[this.Name].ContainsKey("title"))
            {
                var titleCoord = GameClient.WindowSettings.GetCoords(this.Name, "title");
                titleLabel = new Label(titleCoord.ElementAt(0) + 4, titleCoord.ElementAt(1), Colour.White, this.Title);
                this.AddChild(titleLabel);
            }

            GameClient.NetworkClient.PacketManager.Listen<WindowLinePacket>(OnWindowLine);
        }

        public BaseWindow(MakeWindowPacket p, string windowName) : this(windowName)
        {
            this.WindowId = p.WindowId;
            this.Title = p.Title;
            this.NpcId = p.NpcId;
            this.unknownId1 = p.Unknown1;
            this.unknownId2 = p.Unknown2;
            this.createdByServer = true;

            if (titleLabel != null)
                titleLabel.Value = this.Title;

            for (int i = 0; i < p.Buttons.Length; i++)
            {
                if (!p.Buttons[i]) continue;

                string buttonKey = "button_" + ((WindowButtons)i).ToString().ToLowerInvariant();
                if (GameClient.WindowSettings.Sections[this.Name].ContainsKey(buttonKey))
                {
                    var buttonSection = GameClient.ButtonSettings.Sections[((WindowButtons)i).ToString()];
                    var buttonTextures = buttonSection["image"].Split(',');

                    var upTexture = GameClient.ResourceManager.GetTexture($"skins/{GameClient.GameSettings["INIT"]["Skin"]}/{buttonTextures[0]}");
                    var downTexture = GameClient.ResourceManager.GetTexture($"skins/{GameClient.GameSettings["INIT"]["Skin"]}/{buttonTextures[1]}");

                    var buttonCoords = GameClient.WindowSettings.GetCoords(this.Name, buttonKey);
                    var button = new Button(buttonCoords.ElementAt(0), buttonCoords.ElementAt(1), upTexture.W, upTexture.H);
                    button.UpTexture = upTexture;
                    button.DownTexture = downTexture;
                    button.Clicked += CreateClickLambda((WindowButtons)i);
                    this.AddChild(button);
                }
            }
        }

        public override void Render(double dt, int xOffset, int yOffset)
        {
            if (Hidden) return;

            background?.Render(X + xOffset, Y + yOffset, (this.HasFocus ? focusAlpha : unfocusAlpha));

            base.Render(dt, xOffset, yOffset);
        }

        public override bool HandleEvent(SDL.SDL_Event ev, int xOffset, int yOffset)
        {
            if (Hidden && ev.type != SDL.SDL_EventType.SDL_KEYDOWN && ev.type != SDL.SDL_EventType.SDL_TEXTINPUT)
                return false;

            bool preventFurtherEvents = base.HandleEvent(ev, xOffset, yOffset);
            if (preventFurtherEvents)
                return true;

            switch (ev.type)
            {
                case SDL.SDL_EventType.SDL_KEYDOWN:
                    if (UiRoot.FocusedTextBox == null && hideShortcutKey != 0 && ev.key.keysym.sym == hideShortcutKey)
                    {
                        this.Hidden = !this.Hidden;
                        return true;
                    }
                    break;
                case SDL.SDL_EventType.SDL_MOUSEBUTTONDOWN:
                    if (ev.button.button == SDL.SDL_BUTTON_LEFT && Contains(xOffset, yOffset, ev.button.x, ev.button.y))
                    {
                        mouseDown = true;
                        lastMouseDragX = ev.button.x;
                        lastMouseDragY = ev.button.y;

                        UiRoot.BringToFront(this);

                        return true;
                    }
                    break;
                case SDL.SDL_EventType.SDL_MOUSEBUTTONUP:
                    if (ev.button.button == SDL.SDL_BUTTON_LEFT)
                    {
                        mouseDown = false;
                        lastMouseDragX = 0;
                        lastMouseDragY = 0;
                    }
                    break;
                case SDL.SDL_EventType.SDL_MOUSEMOTION:
                    if (mouseDown)
                    {
                        // Can't use the xrel since it's relative to desktop, not our window/scaling
                        this.Rect.x = this.X + (ev.motion.x - lastMouseDragX);
                        this.Rect.y = this.Y + (ev.motion.y - lastMouseDragY);

                        lastMouseDragX = ev.motion.x;
                        lastMouseDragY = ev.motion.y;
                    }

                    this.HasFocus = Contains(xOffset, yOffset, ev.motion.x, ev.motion.y);
                    break;
            }

            return false;
        }

        public virtual void SaveState()
        {
            if (createdByServer) return;

            GameClient.UserSettings.SetValue(this.Name, "winloc", $"{X},{Y}");
            GameClient.UserSettings.SetValue(this.Name, "startup", Hidden ? "0" : "1");
        }

        public void OnWindowLine(object packet)
        {
            var p = (WindowLinePacket)packet;

            if (p.WindowId != this.WindowId) return;

            HandleWindowLine(p);
        }

        protected virtual void HandleWindowLine(WindowLinePacket p)
        {
            
        }

        public virtual void EndWindow()
        {
            Hidden = false;
        }

        public virtual void OnCloseButtonClicked(Button b)
        {
            this.Hidden = true;
        }

        public virtual void OnWindowButtonClicked(Button button, WindowButtons buttonType)
        {
            switch (buttonType)
            {
                case WindowButtons.Close:
                    OnCloseButtonClicked(button);
                    break;
                default:
                    GameClient.NetworkClient.WindowButtonClick((int)buttonType, this.WindowId, this.NpcId, unknownId1, unknownId2);
                    break;
                
            }
        }

        public Action<Button> CreateClickLambda(WindowButtons buttonType)
        {
            return (e) => OnWindowButtonClicked(e, buttonType);
        }

        public void ToggleHidden()
        {
            Hidden = !Hidden;
        }
    }
}
