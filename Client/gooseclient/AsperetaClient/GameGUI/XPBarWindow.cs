using System;
using System.Linq;
using System.Runtime.InteropServices;
using SDL2;

namespace AsperetaClient
{
    class XPBarWindow : StatBarWindow
    {
        private int percentage = 0;

        public XPBarWindow() : base("XPbar")
        {
            hideShortcutKey = SDL.SDL_Keycode.SDLK_F9;
            tooltipText = "Experience Points";

            GameClient.NetworkClient.PacketManager.Listen<ExperienceBarPacket>(OnExperienceBar);
        }

        public void OnExperienceBar(object packet)
        {
            var p = (ExperienceBarPacket)packet;

            this.value = p.ExperienceToNextLevel;
            this.percentage = p.Percentage;
        }

        protected override double GetPercentage()
        {
            return percentage / 100d;
        }
    }
}
