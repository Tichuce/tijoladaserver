using System;
using System.IO;
using SDL2;

namespace AsperetaClient
{
    class ConnectingWindow : GuiElement
    {
        private Texture backgroundTexture;

        private Label messageLabel;

        private string username;
        private string password;

        public ConnectingWindow(string username, string password) : base(-1, -1, 200, 100)
        {
            this.ZIndex = 10;
            this.Padding = 10;

            backgroundTexture = GameClient.ResourceManager.GetTexture($"skins/{GameClient.GameSettings["INIT"]["Skin"]}/Working.bmp");

            var upTexture = GameClient.ResourceManager.GetTexture($"skins/{GameClient.GameSettings["INIT"]["Skin"]}/blankbuttonup.bmp");
            var cancelButton = new Button(-1, 55, upTexture.W, upTexture.H, "Cancel");
            cancelButton.UpTexture = upTexture;
            cancelButton.DownTexture = GameClient.ResourceManager.GetTexture($"skins/{GameClient.GameSettings["INIT"]["Skin"]}/blankbuttondown.bmp");
            cancelButton.Clicked += CancelConnect;
            AddChild(cancelButton);

            messageLabel = new Label(10, 10, Colour.White, "Connecting...") { WordWrap = true };
            AddChild(messageLabel);

            this.username = username;
            this.password = password;

            GameClient.NetworkClient.Connected += OnConnected;
            GameClient.NetworkClient.ConnectionError += OnConnectionError;

            GameClient.NetworkClient.PacketManager.Listen<LoginSuccessPacket>(OnLoginSuccess);
            GameClient.NetworkClient.PacketManager.Listen<LoginFailPacket>(OnLoginFail);
            GameClient.NetworkClient.PacketManager.Listen<SendCurrentMapPacket>(OnSendCurrentMap);

            GameClient.NetworkClient.Connect();
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

        public void CancelConnect(Button b)
        {
            GameClient.NetworkClient.Disconnect();
            Close();
        }

        public void Close()
        {
            this.Parent.RemoveChild(this);
        }

        public void OnConnected()
        {
            messageLabel.Value = "Connected!";
            GameClient.NetworkClient.Login(username, password);
        }

        public void OnConnectionError(Exception e)
        {
            messageLabel.Value = $"Could not connect to server. {e.Message}";
        }

        public void OnLoginSuccess(object packet)
        {
            GameClient.RealmName = ((LoginSuccessPacket)packet).RealmName;
            CreateAndSetUserSettings(GameClient.RealmName);
            GameClient.NetworkClient.LoginContinued();
        }

        public void OnSendCurrentMap(object packet)
        {
            Close();
            var sendCurrentMapPacket = (SendCurrentMapPacket)packet;
            GameClient.StateManager.AppendState(new GameScreen(sendCurrentMapPacket.MapNumber, sendCurrentMapPacket.MapName));
            GameClient.NetworkClient.PacketManager.Remove<SendCurrentMapPacket>(OnSendCurrentMap);
        }

        public void OnLoginFail(object packet)
        {
            messageLabel.Value = $"Could not connect to server. {((LoginFailPacket)packet).Message}";
        }

        public void CreateAndSetUserSettings(string realmName)
        {
            string userSettingsPath = $"user/{realmName}-{username}.ini";
            if (!File.Exists(userSettingsPath))
            {
                // AspGame names the same file <name>-<realm>.ini.
                if (File.Exists($"user/{username}-{realmName}.ini"))
                    File.Copy($"user/{username}-{realmName}.ini", userSettingsPath);
                else if (File.Exists($"user/Goose-Default.ini"))
                    File.Copy($"user/Goose-Default.ini", userSettingsPath);
                else if (File.Exists($"user/Maisemore-Default.ini"))
                    File.Copy($"user/Maisemore-Default.ini", userSettingsPath);
            }

            GameClient.UserSettings = new IniFile(userSettingsPath);

            GameClient.GameSettings["INIT"]["Name"] = username;
        }
    }
}
