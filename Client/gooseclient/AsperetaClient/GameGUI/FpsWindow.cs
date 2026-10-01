using System;
using System.Linq;
using System.Runtime.InteropServices;
using SDL2;

namespace AsperetaClient
{
    class FpsWindow : BaseWindow
    {
        private double recordingTime = 0;
        private int numberOfFrames = 0;

        private Label fpsLabel;

        public FpsWindow() : base("FPS")
        {
            hideShortcutKey = SDL.SDL_Keycode.SDLK_F5;

            fpsLabel = new Label(objoffX + 2, objoffY + 1, Colour.White, "FPS 100");
            this.AddChild(fpsLabel);
        }

        public override void Update(double dt)
        {
            base.Update(dt);

            recordingTime += dt;
            numberOfFrames++;

            if (recordingTime > 1)
            {
                var fps = Math.Ceiling(numberOfFrames / recordingTime);

                recordingTime = 0;
                numberOfFrames = 0;

                fpsLabel.Value = $"FPS {fps:0}";
            }
        }
    }
}
