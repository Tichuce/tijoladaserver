using System;
using System.Linq;
using System.Runtime.InteropServices;
using SDL2;

namespace AsperetaClient
{
    class HPBarWindow : StatBarWindow
    {
        public HPBarWindow() : base("HPbar")
        {
            hideShortcutKey = SDL.SDL_Keycode.SDLK_F6;
            tooltipText = "Hit Points";

            GameClient.NetworkClient.PacketManager.Listen<StatusInfoPacket>(OnStatusInfo);
        }

        public void OnStatusInfo(object packet)
        {
            var p = (StatusInfoPacket)packet;

            this.value = p.CurrentHP;
            this.maxValue = p.MaxHP;
        }
    }
}
