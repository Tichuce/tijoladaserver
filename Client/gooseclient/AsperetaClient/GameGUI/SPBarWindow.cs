using System;
using System.Linq;
using System.Runtime.InteropServices;
using SDL2;

namespace AsperetaClient
{
    class SPBarWindow : StatBarWindow
    {
        public SPBarWindow() : base("SPbar")
        {
            hideShortcutKey = SDL.SDL_Keycode.SDLK_F8;
            tooltipText = "Spirit Points";

            GameClient.NetworkClient.PacketManager.Listen<StatusInfoPacket>(OnStatusInfo);
        }

        public void OnStatusInfo(object packet)
        {
            var p = (StatusInfoPacket)packet;

            this.value = p.CurrentSP;
            this.maxValue = p.MaxSP;
        }
    }
}
