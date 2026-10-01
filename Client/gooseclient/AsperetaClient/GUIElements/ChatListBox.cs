using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using SDL2;

namespace AsperetaClient
{
    public enum ChatType
    {
        Chat = 1,
        Guild,
        Group,
        Melee,
        Spells,
        Tell,
        Server,
        Client = 8,
    }

    class ChatLine
    {
        public Colour Colour { get; set; }
        public string Text { get; set; }

        public ChatLine(Colour colour, string text)
        {
            this.Colour = colour;
            this.Text = text;
        }
    }

    class ChatListBox : GuiElement
    {
        private static Dictionary<ChatType, Colour> chatColours = new Dictionary<ChatType, Colour>();

        private int displayedLines;
        private int lastViewIndex = -1;

        public bool FilterPickupMessages { get; set; } = false;

        private List<ChatLine> lines = new List<ChatLine>();

        public ChatListBox(int x, int y, int w, int h, int numLines) : base(x, y, w, h)
        {
            this.displayedLines = numLines;
            this.Padding = 6;

            var filterColours = GameClient.UserSettings["FilterColors"];
            foreach (var kvp in filterColours)
            {
                if (Enum.TryParse<ChatType>(kvp.Key, true, out ChatType chatType))
                {
                    chatColours[chatType] = GameClient.ParseColour(kvp.Value);
                }
            }

            if (!chatColours.ContainsKey(ChatType.Client))
                chatColours[ChatType.Client] = Colour.Blue;
        }

        public override void Update(double dt)
        {

        }

        public override void Render(double dt, int xOffset, int yOffset)
        {
            if (lastViewIndex == -1) return;

            int y = Math.Max(0, displayedLines - lastViewIndex - 1) * GameClient.FontRenderer.CharHeight;

            for (int i = Math.Max(0, lastViewIndex - displayedLines + 1); i <= lastViewIndex; i++)
            {
                GameClient.FontRenderer.RenderText(
                    lines[i].Text, 
                    X + Padding + xOffset, 
                    Y + yOffset + y + 1, 
                    lines[i].Colour);

                y += GameClient.FontRenderer.CharHeight;
            }
        }

        public override bool HandleEvent(SDL.SDL_Event ev, int xOffset, int yOffset)
        {
            switch (ev.type)
            {
                case SDL.SDL_EventType.SDL_KEYDOWN:
                    if (ev.key.keysym.sym == SDL.SDL_Keycode.SDLK_PAGEUP)
                    {
                        lastViewIndex = Math.Max(0, lastViewIndex - 6);
                    }
                    else if (ev.key.keysym.sym == SDL.SDL_Keycode.SDLK_PAGEDOWN)
                    {
                        lastViewIndex = Math.Min(lines.Count - 1, lastViewIndex + 6);
                    }
                    break;
            }

            return false;
        }

        public void AddText(ChatType chatType, string text)
        {
            if (FilterPickupMessages && chatType == ChatType.Group && text.Contains("picked up") && !text.StartsWith("[group]")) return;

            foreach (var line in GameClient.FontRenderer.WordWrap(text, this.W, "  "))
            {
                if (lastViewIndex == lines.Count - 1)
                {
                    lastViewIndex++;
                }

                lines.Add(new ChatLine(chatColours[chatType], line));
            }

            if (lines.Count > 500)
            {
                int toRemove = lines.Count - 500;
                lines.RemoveRange(0, toRemove);
                lastViewIndex = Math.Max(0, lastViewIndex - toRemove);
            }
        }
    }
}
