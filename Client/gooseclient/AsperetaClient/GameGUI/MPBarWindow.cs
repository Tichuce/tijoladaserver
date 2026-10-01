using System;
using System.Linq;
using System.Runtime.InteropServices;
using SDL2;

namespace AsperetaClient
{
    class MPBarWindow : StatBarWindow
    {
        public MPBarWindow() : base("MPbar")
        {
            hideShortcutKey = SDL.SDL_Keycode.SDLK_F7;
            tooltipText = "Mana Points";

            GameClient.NetworkClient.PacketManager.Listen<StatusInfoPacket>(OnStatusInfo);
        }

        public void OnStatusInfo(object packet)
        {
            var p = (StatusInfoPacket)packet;

            this.value = p.CurrentMP;
            this.maxValue = p.MaxMP;
        }
    }
}
