using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using SDL2;

namespace AsperetaClient
{
    class PartyWindowLine
    {
        public int LineNumber { get; set; }
        public int LoginId { get; set; }
        public string Name { get; set; }
        public int HPPercentage { get; set; }
        public int MPPercentage { get; set; }

        public PartyWindowLine(int lineNumber, int loginId, string name)
        {
            this.LineNumber = lineNumber;
            this.LoginId = loginId;
            this.Name = name;
            this.HPPercentage = 100;
            this.MPPercentage = 0;
        }
    }

    class PartyWindow : BaseWindow
    {
        private PartyWindowLine[] lines;

        private Dictionary<int, PartyWindowLine> loginIdToLine = new Dictionary<int, PartyWindowLine>();

        public PartyWindow() : base("Group")
        {
            hideShortcutKey = SDL.SDL_Keycode.SDLK_p;

            lines = new PartyWindowLine[rows * columns];

            GameClient.NetworkClient.PacketManager.Listen<GroupUpdatePacket>(OnGroupUpdate);
            GameClient.NetworkClient.PacketManager.Listen<VitalsPercentagePacket>(OnVitalsPercentage);
        }

        public override void Render(double dt, int xOffset, int yOffset)
        {
            if (Hidden) return;

            base.Render(dt, xOffset, yOffset);

            foreach (var line in lines)
            {
                if (line == null) return;

                int x = X + objoffX + xOffset + 6;
                int y = Y + objoffY + yOffset + (line.LineNumber * objH);
                GameClient.FontRenderer.RenderText(line.Name, x, y, Colour.White);

                SDL.SDL_Rect rect;
                rect.x = x + GameClient.FontRenderer.CharWidth;
                rect.y = y + GameClient.FontRenderer.CharHeight;
                rect.w = 100;
                rect.h = 1;

                // hp bar
                rect.w = (int)(rect.w * (line.HPPercentage / 100d));
                SDL.SDL_SetRenderDrawColor(GameClient.Renderer, 0, 252, 0, 255);
                SDL.SDL_RenderFillRect(GameClient.Renderer, ref rect);

                // mp bar
                rect.y = rect.y + 1;
                rect.w = (int)(rect.w * (line.MPPercentage / 100d));
                rect.h = 1;
                SDL.SDL_SetRenderDrawColor(GameClient.Renderer, 0, 0, 248, 255);
                SDL.SDL_RenderFillRect(GameClient.Renderer, ref rect);
            }
        }

        public void OnGroupUpdate(object packet)
        {
            var p = (GroupUpdatePacket)packet;
            
            if (p.LineNumber >= lines.Length) return;

            if (p.LoginId == 0)
            {
                var oldLine = lines[p.LineNumber];

                if (oldLine != null)
                {
                    if (loginIdToLine.ContainsKey(oldLine.LoginId)) 
                        loginIdToLine.Remove(oldLine.LoginId);
                    lines[p.LineNumber] = null;
                }
            }
            else
            {
                var line = lines[p.LineNumber];
                if (line == null)
                {
                    line = new PartyWindowLine(p.LineNumber, p.LoginId, p.Name);
                    lines[p.LineNumber] = line;
                    loginIdToLine[p.LoginId] = line;
                }
                else
                {
                    line.LoginId = p.LoginId;
                    line.Name = p.Name;
                    line.HPPercentage = 100;
                    line.MPPercentage = 0;
                }
            }
        }

        public void OnVitalsPercentage(object packet)
        {
            var p = (VitalsPercentagePacket)packet;

            if (!loginIdToLine.TryGetValue(p.LoginId, out PartyWindowLine line))
                return;
            
            line.HPPercentage = p.HPPercentage;
            line.MPPercentage = p.MPPercentage;
        }
    }
}