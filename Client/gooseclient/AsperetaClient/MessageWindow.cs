using System;
using System.IO;
using SDL2;

namespace AsperetaClient
{
    class MessageWindow : GuiElement
    {
        private Texture backgroundTexture;

        private Label messageLabel;

        public MessageWindow(string message) : base(-1, -1, 200, 100)
        {
            this.ZIndex = 10;
            this.Padding = 10;

            backgroundTexture = GameClient.ResourceManager.GetTexture($"skins/{GameClient.GameSettings["INIT"]["Skin"]}/Working.bmp");

            var upTexture = GameClient.ResourceManager.GetTexture($"skins/{GameClient.GameSettings["INIT"]["Skin"]}/blankbuttonup.bmp");
            var closeButton = new Button(-1, 55, upTexture.W, upTexture.H, "Close");
            closeButton.UpTexture = upTexture;
            closeButton.DownTexture = GameClient.ResourceManager.GetTexture($"skins/{GameClient.GameSettings["INIT"]["Skin"]}/blankbuttondown.bmp");
            closeButton.Clicked += OnClose;
            AddChild(closeButton);

            messageLabel = new Label(10, 10, Colour.White, message) { WordWrap = true };
            AddChild(messageLabel);
        }

        public override void Update(double dt)
        {
            foreach (var gui in Children.ToArray())
            {
                gui.Update(dt);
            }
        }

        public override void Render(double dt, int xOffset, int yOffset)
        {
            SDL.SDL_Rect fullScreen;
            fullScreen.x = 0;
            fullScreen.y = 0;
            fullScreen.w = GameClient.ScreenWidth;
            fullScreen.h = GameClient.ScreenHeight;

            SDL.SDL_SetRenderDrawColor(GameClient.Renderer, 0, 0, 0, 180);
            SDL.SDL_RenderFillRect(GameClient.Renderer, ref fullScreen);

            backgroundTexture.Render(X + xOffset, Y + yOffset, W, H);

            foreach (var gui in Children)
            {
                gui.Render(dt, X + xOffset, Y + yOffset);
            }
        }

        public override bool HandleEvent(SDL.SDL_Event ev, int xOffset, int yOffset)
        {
            foreach (var gui in Children.ToArray())
            {
                bool preventFurtherEvents = gui.HandleEvent(ev, X + xOffset, Y + yOffset);
                if (preventFurtherEvents)
                    return true;
            }

            return true;
        }

        public void OnClose(Button b)
        {
            Close();
        }

        public void Close()
        {
            this.Parent.RemoveChild(this);
        }
    }
}
