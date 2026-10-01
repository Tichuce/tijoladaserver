using System;
using System.Collections.Generic;
using SDL2;

namespace AsperetaClient
{
    // Small status button for auto-hunt. Left click: OFF -> ON -> PAUSED -> ON.
    // Right click: OFF. Drag to move, F10 to hide. Position is saved like other windows.
    public class AutoHuntWindow : BaseWindow
    {
        private const string WindowName = "AutoHunt";
        private const int ClickSlop = 3;

        private static readonly Colour OnColour = new Colour(96, 220, 72);
        private static readonly Colour PausedColour = new Colour(248, 196, 0);
        private static readonly Colour OffColour = new Colour(150, 150, 150);
        private static readonly Colour PanelColour = new Colour(16, 16, 16, 215);

        private readonly AutoHuntTracker tracker;

        private bool leftDown = false;
        private bool rightDown = false;
        private int downX;
        private int downY;
        private double blinkTime = 0;

        public AutoHuntWindow(AutoHuntTracker tracker) : base(EnsureSkinSection())
        {
            this.tracker = tracker;
            hideShortcutKey = SDL.SDL_Keycode.SDLK_F10;

            // Drawn in code, so it works with any skin.
            background = null;
            Rect.w = 124;
            Rect.h = 21;

            if (!GameClient.UserSettings.Sections.ContainsKey(WindowName))
            {
                Rect.x = GameClient.ScreenWidth - Rect.w - 4;
                Rect.y = 4;
                Hidden = false;
            }
        }

        // BaseWindow reads its layout from the skin's Window.ini. The original skins have no
        // [AutoHunt] section, so add a minimal one in memory (Window.ini is never written back).
        private static string EnsureSkinSection()
        {
            if (!GameClient.WindowSettings.Sections.ContainsKey(WindowName))
            {
                GameClient.WindowSettings.Sections[WindowName] = new Dictionary<string, string>
                {
                    ["image"] = GameClient.WindowSettings["FPS"]["image"],
                    ["windim"] = "1,1",
                    ["objoff"] = "0,0",
                    ["objdim"] = "0,0",
                    ["focus"] = "255,255",
                };
            }

            return WindowName;
        }

        public static string StateText(AutoHuntState state)
        {
            switch (state)
            {
                case AutoHuntState.On: return "AUTO-HUNT ON";
                case AutoHuntState.Paused: return "AUTO-HUNT PAUSED";
                default: return "AUTO-HUNT OFF";
            }
        }

        private static Colour StateColour(AutoHuntState state)
        {
            switch (state)
            {
                case AutoHuntState.On: return OnColour;
                case AutoHuntState.Paused: return PausedColour;
                default: return OffColour;
            }
        }

        public override void Update(double dt)
        {
            base.Update(dt);
            tracker.Update(dt);
            blinkTime = (blinkTime + dt) % 1.0;
        }

        public override void Render(double dt, int xOffset, int yOffset)
        {
            if (Hidden) return;

            int x = X + xOffset;
            int y = Y + yOffset;
            var colour = StateColour(tracker.State);

            SDL.SDL_Rect panel;
            panel.x = x;
            panel.y = y;
            panel.w = W;
            panel.h = H;
            SDL.SDL_SetRenderDrawColor(GameClient.Renderer, PanelColour.R, PanelColour.G, PanelColour.B, PanelColour.A);
            SDL.SDL_RenderFillRect(GameClient.Renderer, ref panel);
            SDL.SDL_SetRenderDrawColor(GameClient.Renderer, colour.R, colour.G, colour.B, (byte)(HasFocus ? 255 : 170));
            SDL.SDL_RenderDrawRect(GameClient.Renderer, ref panel);

            // Status light: solid when settled, hollow while waiting for the server.
            SDL.SDL_Rect light;
            light.x = x + 5;
            light.y = y + 5;
            light.w = 11;
            light.h = 11;
            SDL.SDL_SetRenderDrawColor(GameClient.Renderer, colour.R, colour.G, colour.B, colour.A);
            if (tracker.Pending)
                SDL.SDL_RenderDrawRect(GameClient.Renderer, ref light);
            else if (tracker.State != AutoHuntState.Paused || blinkTime < 0.6)
                SDL.SDL_RenderFillRect(GameClient.Renderer, ref light);
            else
                SDL.SDL_RenderDrawRect(GameClient.Renderer, ref light);

            GameClient.FontRenderer.RenderText(StateText(tracker.State), x + 21, y + 5, colour);

            if (HasFocus && !leftDown)
            {
                string hint = "Click: on/pause  Right-click: off";
                var tooltip = new Tooltip(x, y + H + 2, new Colour(0, 4, 120), Colour.White, hint);
                tooltip.SetPosition(Math.Max(0, x + W - tooltip.W), y + H + 2);
                tooltip.Render(dt, 0, 0);
            }
        }

        public override bool HandleEvent(SDL.SDL_Event ev, int xOffset, int yOffset)
        {
            if (!Hidden)
            {
                switch (ev.type)
                {
                    case SDL.SDL_EventType.SDL_MOUSEBUTTONDOWN:
                        if (!Contains(xOffset, yOffset, ev.button.x, ev.button.y)) break;

                        if (ev.button.button == SDL.SDL_BUTTON_RIGHT)
                        {
                            rightDown = true;
                            return true;
                        }

                        if (ev.button.button == SDL.SDL_BUTTON_LEFT)
                        {
                            leftDown = true;
                            downX = ev.button.x;
                            downY = ev.button.y;
                        }
                        break;

                    case SDL.SDL_EventType.SDL_MOUSEBUTTONUP:
                        if (ev.button.button == SDL.SDL_BUTTON_RIGHT && rightDown)
                        {
                            rightDown = false;
                            if (Contains(xOffset, yOffset, ev.button.x, ev.button.y))
                                tracker.RequestOff();
                            return true;
                        }

                        if (ev.button.button == SDL.SDL_BUTTON_LEFT && leftDown)
                        {
                            leftDown = false;
                            // A press that ends where it started is a click; anything else was a drag.
                            bool clicked = Contains(xOffset, yOffset, ev.button.x, ev.button.y) &&
                                Math.Abs(ev.button.x - downX) <= ClickSlop &&
                                Math.Abs(ev.button.y - downY) <= ClickSlop;

                            base.HandleEvent(ev, xOffset, yOffset);

                            if (clicked)
                                tracker.RequestNext();
                            return clicked;
                        }
                        break;
                }
            }

            return base.HandleEvent(ev, xOffset, yOffset);
        }

        public override void SaveState()
        {
            GameClient.UserSettings.SetValue(WindowName, "winloc", $"{X},{Y}");
            GameClient.UserSettings.SetValue(WindowName, "startup", Hidden ? "0" : "1");
        }
    }
}
